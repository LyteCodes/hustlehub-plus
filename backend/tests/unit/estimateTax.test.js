'use strict';

/**
 * @file estimateTax.test.js
 * @description Unit tests for the pure estimateTax module using node:test.
 * All amounts are in integer cents. Cross-checks are computed from first
 * principles against the SARS 2026/27 tables.
 *
 * https://nodejs.org/api/test.html
 * https://nodejs.org/api/assert.html
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { estimateTax } = require('../../src/lib/estimateTax');

// SARS 2026/27 constants (kept here as expected values for self-documenting tests)
const PRIMARY_REBATE   = 1_782_000; // R17 820 × 100
const SECONDARY_REBATE =   977_400; // R9 774 × 100
const TERTIARY_REBATE  =   326_700; // R3 267 × 100
const PLATFORM_FEE_BPS =     1_000; // 10%

describe('estimateTax – platform fee', () => {
  it('deducts 10% platform fee by default', () => {
    const result = estimateTax({ grossCents: 10_000_000 }); // R100 000
    assert.strictEqual(result.platformFeeRateBps, PLATFORM_FEE_BPS);
    assert.strictEqual(result.platformFeeCents, 1_000_000);  // R10 000
    assert.strictEqual(result.netCents,         9_000_000);  // R90 000
  });

  it('honours an overridden platform fee rate', () => {
    // 15% override
    const result = estimateTax({ grossCents: 10_000_000, platformFeeRateBps: 1_500 });
    assert.strictEqual(result.platformFeeCents, 1_500_000);
    assert.strictEqual(result.netCents,         8_500_000);
  });
});

describe('estimateTax – zero-income edge case', () => {
  it('returns zero tax for zero gross income', () => {
    const result = estimateTax({ grossCents: 0 });
    assert.strictEqual(result.grossCents,              0);
    assert.strictEqual(result.platformFeeCents,        0);
    assert.strictEqual(result.netCents,                0);
    assert.strictEqual(result.annualNetCents,           0);
    assert.strictEqual(result.taxBeforeRebateCents,    0);
    assert.strictEqual(result.annualTaxPayableCents,   0);
    assert.strictEqual(result.proratedTaxCents,        0);
    assert.strictEqual(result.effectiveRatePct, '0.00%');
  });
});

describe('estimateTax – R99 000 primary threshold', () => {
  it('payable tax is exactly zero at the primary threshold', () => {
    // Gross R110 000 → platform fee 10% → net R99 000 (= primary threshold)
    const result = estimateTax({ grossCents: 11_000_000 });
    assert.strictEqual(result.netCents,               9_900_000);
    assert.strictEqual(result.taxBeforeRebateCents,   1_782_000); // 18% × R99 000
    assert.strictEqual(result.rebateCents,            PRIMARY_REBATE);
    assert.strictEqual(result.annualTaxPayableCents,  0);
  });

  it('income one cent above threshold incurs a small non-negative tax', () => {
    const result = estimateTax({ grossCents: 11_000_100 }); // 1 extra cent gross
    assert.ok(result.annualTaxPayableCents >= 0);
    assert.strictEqual(result.marginalRatePct, '18.00%');
  });
});

describe('estimateTax – band-1 income (18%)', () => {
  it('calculates tax correctly for R200 000 gross (net R180 000)', () => {
    // Net = R180 000, band-1: 18% × 180 000 = R32 400 → minus R17 820 = R14 580
    const result = estimateTax({ grossCents: 20_000_000 });
    assert.strictEqual(result.netCents,               18_000_000);
    assert.strictEqual(result.taxBeforeRebateCents,    3_240_000); // R32 400
    assert.strictEqual(result.rebateCents,            PRIMARY_REBATE);
    assert.strictEqual(result.annualTaxPayableCents,   1_458_000); // R14 580
    assert.strictEqual(result.marginalRatePct, '18.00%');
  });
});

describe('estimateTax – band-3 income (31%)', () => {
  it('calculates tax correctly for R500 000 gross (net R450 000)', () => {
    // Net R450 000, in band-3 (R383 901–R532 000):
    //   R80 142 + 31% × (R450 000 – R383 900) = R80 142 + 31% × R66 100 = R80 142 + R20 491 = R100 633
    //   After primary rebate: R100 633 – R17 820 = R82 813
    const result = estimateTax({ grossCents: 50_000_000 });
    assert.strictEqual(result.netCents,                45_000_000);
    assert.strictEqual(result.taxBeforeRebateCents,    10_063_300); // R100 633
    assert.strictEqual(result.annualTaxPayableCents,    8_281_300); // R82 813
    assert.strictEqual(result.marginalRatePct, '31.00%');
  });
});

describe('estimateTax – rebate tiers', () => {
  it('applies only primary rebate for age < 65', () => {
    const result = estimateTax({ grossCents: 20_000_000, age: 30 });
    assert.strictEqual(result.rebateCents, PRIMARY_REBATE);
  });

  it('applies primary + secondary rebate for age 65', () => {
    const result = estimateTax({ grossCents: 20_000_000, age: 65 });
    assert.strictEqual(result.rebateCents, PRIMARY_REBATE + SECONDARY_REBATE);
  });

  it('applies all three rebates for age 75', () => {
    const result = estimateTax({ grossCents: 20_000_000, age: 75 });
    assert.strictEqual(result.rebateCents, PRIMARY_REBATE + SECONDARY_REBATE + TERTIARY_REBATE);
  });

  it('tax payable never goes negative', () => {
    // Very high rebate relative to income
    const result = estimateTax({ grossCents: 1_000_000, age: 75 });
    assert.ok(result.annualTaxPayableCents >= 0);
  });
});

describe('estimateTax – annualise-then-pro-rate', () => {
  it('annualises YTD income before computing tax', () => {
    // 183 days elapsed of 365-day year, same gross
    const full  = estimateTax({ grossCents: 20_000_000 });
    const half  = estimateTax({ grossCents: 20_000_000, ytdDays: 183, taxYearDays: 365 });
    // Annualised income should be roughly double the net
    const expectedAnnual = Math.round(full.netCents * 365 / 183);
    assert.strictEqual(half.annualNetCents, expectedAnnual);
  });

  it('pro-rated tax is less than or equal to annual tax', () => {
    const result = estimateTax({ grossCents: 50_000_000, ytdDays: 182, taxYearDays: 365 });
    assert.ok(result.proratedTaxCents <= result.annualTaxPayableCents);
  });

  it('no pro-rating when ytdDays equals taxYearDays', () => {
    const result = estimateTax({ grossCents: 20_000_000, ytdDays: 365, taxYearDays: 365 });
    assert.strictEqual(result.proratedTaxCents, result.annualTaxPayableCents);
    assert.strictEqual(result.annualNetCents,   result.netCents);
  });
});

describe('estimateTax – provisional tax (IRP6)', () => {
  it('first + second payment equals annual tax payable', () => {
    const result = estimateTax({ grossCents: 50_000_000 });
    assert.strictEqual(
      result.provisionalTax.firstPaymentCents + result.provisionalTax.secondPaymentCents,
      result.annualTaxPayableCents,
    );
  });

  it('reports correct SARS 2026/27 IRP6 deadlines', () => {
    const { dates } = estimateTax({ grossCents: 20_000_000 }).provisionalTax;
    assert.strictEqual(dates.firstDeadline,  '2026-08-31');
    assert.strictEqual(dates.secondDeadline, '2027-02-28');
    assert.strictEqual(dates.topUpDeadline,  '2027-09-30');
  });
});

describe('estimateTax – integer integrity', () => {
  it('all monetary output fields are integers', () => {
    const result = estimateTax({ grossCents: 15_000_000, ytdDays: 200, taxYearDays: 365 });
    const intFields = [
      'grossCents', 'platformFeeCents', 'netCents', 'annualNetCents',
      'taxBeforeRebateCents', 'rebateCents', 'annualTaxPayableCents', 'proratedTaxCents',
    ];
    for (const field of intFields) {
      assert.ok(Number.isInteger(result[field]), `${field} must be an integer`);
    }
    assert.ok(Number.isInteger(result.provisionalTax.firstPaymentCents));
    assert.ok(Number.isInteger(result.provisionalTax.secondPaymentCents));
  });

  it('taxYear is "2026/27"', () => {
    assert.strictEqual(estimateTax({ grossCents: 1_000_000 }).taxYear, '2026/27');
  });
});

describe('estimateTax – input validation', () => {
  it('throws TypeError for negative grossCents', () => {
    assert.throws(() => estimateTax({ grossCents: -1 }), TypeError);
  });

  it('throws TypeError for fractional grossCents', () => {
    assert.throws(() => estimateTax({ grossCents: 1.5 }), TypeError);
  });

  it('throws TypeError for ytdDays < 1', () => {
    assert.throws(() => estimateTax({ grossCents: 1_000_000, ytdDays: 0 }), TypeError);
  });
});
