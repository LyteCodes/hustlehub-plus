'use strict';

const { estimateTax } = require('../../../src/lib/estimateTax');

const PRIMARY_REBATE   = 1_782_000;   // cents
const SECONDARY_REBATE =   977_400;
const TERTIARY_REBATE  =   326_700;
const FEE_BPS          = 1_000;       // 10%

describe('estimateTax – platform fee', () => {
  test('deducts 10% platform fee from gross', () => {
    const r = estimateTax({ grossCents: 10_000_000 });
    expect(r.platformFeeRateBps).toBe(FEE_BPS);
    expect(r.platformFeeCents).toBe(1_000_000);
    expect(r.netCents).toBe(9_000_000);
  });

  test('fee override is respected', () => {
    const r = estimateTax({ grossCents: 10_000_000, platformFeeRateBps: 500 });
    expect(r.platformFeeCents).toBe(500_000);
    expect(r.netCents).toBe(9_500_000);
  });
});

describe('estimateTax – zero income', () => {
  test('all monetary outputs are zero when grossCents=0', () => {
    const r = estimateTax({ grossCents: 0 });
    expect(r.grossCents).toBe(0);
    expect(r.platformFeeCents).toBe(0);
    expect(r.netCents).toBe(0);
    expect(r.annualNetCents).toBe(0);
    expect(r.taxBeforeRebateCents).toBe(0);
    expect(r.annualTaxPayableCents).toBe(0);
    expect(r.proratedTaxCents).toBe(0);
  });

  test('effective rate is 0.00% when income is zero', () => {
    expect(estimateTax({ grossCents: 0 }).effectiveRatePct).toBe('0.00%');
  });
});

describe('estimateTax – R99 000 primary threshold (under-65)', () => {
  test('net income at exactly R99 000 produces zero tax', () => {
    const r = estimateTax({ grossCents: 11_000_000 });
    expect(r.netCents).toBe(9_900_000);
    expect(r.annualTaxPayableCents).toBe(0);
    expect(r.proratedTaxCents).toBe(0);
  });
});

describe('estimateTax – bracket 1 (18%)', () => {
  test('income within R0–R245 900 band uses 18% marginal rate', () => {
    const r = estimateTax({ grossCents: 20_000_000 });
    expect(r.annualNetCents).toBe(18_000_000);
    expect(r.marginalRatePct).toBe('18.00%');

    const expectedGrossTax = Math.round(18_000_000 * 1800 / 10_000); // 3 240 000
    expect(r.taxBeforeRebateCents).toBe(expectedGrossTax);

    const expectedTax = expectedGrossTax - PRIMARY_REBATE; // 1 458 000
    expect(r.annualTaxPayableCents).toBe(expectedTax);
  });
});

describe('estimateTax – bracket 3 (31%)', () => {
  test('income in R383 901–R532 000 band uses 31% marginal rate', () => {
    const r = estimateTax({ grossCents: 50_000_000 });
    expect(r.annualNetCents).toBe(45_000_000);
    expect(r.marginalRatePct).toBe('31.00%');

    const expectedGrossTax = 8_014_200 + Math.round((45_000_000 - 38_390_000) * 3100 / 10_000);
    expect(r.taxBeforeRebateCents).toBe(expectedGrossTax);
    expect(r.annualTaxPayableCents).toBe(expectedGrossTax - PRIMARY_REBATE);
  });
});

describe('estimateTax – rebate tiers', () => {
  const BASE_GROSS = 100_000_000;

  test('age < 65 applies primary rebate only', () => {
    const r = estimateTax({ grossCents: BASE_GROSS, age: 30 });
    expect(r.rebateCents).toBe(PRIMARY_REBATE);
  });

  test('age 65–74 adds secondary rebate', () => {
    const r = estimateTax({ grossCents: BASE_GROSS, age: 65 });
    expect(r.rebateCents).toBe(PRIMARY_REBATE + SECONDARY_REBATE);
  });

  test('age >= 75 adds tertiary rebate', () => {
    const r = estimateTax({ grossCents: BASE_GROSS, age: 75 });
    expect(r.rebateCents).toBe(PRIMARY_REBATE + SECONDARY_REBATE + TERTIARY_REBATE);
  });

  test('rebate difference between age 64 and 65 is exactly secondary rebate', () => {
    const r64 = estimateTax({ grossCents: BASE_GROSS, age: 64 });
    const r65 = estimateTax({ grossCents: BASE_GROSS, age: 65 });
    expect(r65.annualTaxPayableCents).toBe(r64.annualTaxPayableCents - SECONDARY_REBATE);
  });
});

describe('estimateTax – annualise-then-pro-rate', () => {
  test('YTD 100/365: annualises gross and pro-rates tax', () => {
    const r = estimateTax({ grossCents: 10_000_000, ytdDays: 100, taxYearDays: 365 });

    const net      = 9_000_000;
    const annual   = Math.round(net * 365 / 100); 
    expect(r.annualNetCents).toBe(annual);

    const baseTax  = 4_426_200 + Math.round((annual - 24_590_000) * 2600 / 10_000);
    const annTax   = baseTax - PRIMARY_REBATE;
    expect(r.annualTaxPayableCents).toBe(annTax);

    const prorated = Math.round(annTax * 100 / 365);
    expect(r.proratedTaxCents).toBe(prorated);
  });

  test('no YTD (full year): proratedTax equals annualTaxPayable', () => {
    const r = estimateTax({ grossCents: 20_000_000 });
    expect(r.proratedTaxCents).toBe(r.annualTaxPayableCents);
  });

  test('ytdDays === taxYearDays treated as full year', () => {
    const r = estimateTax({ grossCents: 20_000_000, ytdDays: 365, taxYearDays: 365 });
    expect(r.proratedTaxCents).toBe(r.annualTaxPayableCents);
  });
});

describe('estimateTax – IRP6 provisional tax split', () => {
  test('firstPayment + secondPayment === annualTaxPayable', () => {
    const r = estimateTax({ grossCents: 50_000_000 });
    expect(r.provisionalTax.firstPaymentCents + r.provisionalTax.secondPaymentCents)
      .toBe(r.annualTaxPayableCents);
  });

  test('first payment is floor(annual/2) for odd amounts', () => {
    const r = estimateTax({ grossCents: 20_000_000 });
    const annual = r.annualTaxPayableCents;
    expect(r.provisionalTax.firstPaymentCents).toBe(Math.round(annual / 2));
  });

  test('provisional tax dates are present and correct', () => {
    const r = estimateTax({ grossCents: 20_000_000 });
    expect(r.provisionalTax.dates.firstDeadline).toBe('2026-08-31');
    expect(r.provisionalTax.dates.secondDeadline).toBe('2027-02-28');
    expect(r.provisionalTax.dates.topUpDeadline).toBe('2027-09-30');
  });
});

describe('estimateTax – integer integrity', () => {
  test('all monetary output fields are integers', () => {
    const r = estimateTax({ grossCents: 55_555_555, ytdDays: 200, taxYearDays: 365 });
    const intFields = [
      r.grossCents, r.platformFeeCents, r.netCents, r.annualNetCents,
      r.taxBeforeRebateCents, r.rebateCents, r.annualTaxPayableCents, r.proratedTaxCents,
      r.provisionalTax.firstPaymentCents, r.provisionalTax.secondPaymentCents,
    ];
    for (const v of intFields) {
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  test('taxYear label matches data file', () => {
    expect(estimateTax({ grossCents: 1_000_000 }).taxYear).toBe('2026/27');
  });
});

describe('estimateTax – input validation', () => {
  test('throws TypeError for negative grossCents', () => {
    expect(() => estimateTax({ grossCents: -1 })).toThrow(TypeError);
  });

  test('throws TypeError for float grossCents', () => {
    expect(() => estimateTax({ grossCents: 100.5 })).toThrow(TypeError);
  });

  test('throws TypeError for string grossCents', () => {
    expect(() => estimateTax({ grossCents: '1000' })).toThrow(TypeError);
  });

  test('throws TypeError for non-positive taxYearDays', () => {
    expect(() => estimateTax({ grossCents: 1000, taxYearDays: 0 })).toThrow(TypeError);
  });

  test('throws TypeError for float ytdDays', () => {
    expect(() => estimateTax({ grossCents: 1000, ytdDays: 1.5 })).toThrow(TypeError);
  });
});
