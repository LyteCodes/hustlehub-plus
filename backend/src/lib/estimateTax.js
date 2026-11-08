'use strict';

/**
 * @file estimateTax.js
 * @description Pure SARS 2026/27 individual income-tax estimator.
 * All monetary values are integer cents (1/100 rand) to avoid floating-point
 * rounding. Rates are stored in basis points (bps) in the data file so every
 * arithmetic step stays in integer space.
 */

const TAX_DATA = require('../data/sars-2026-27.json');

/**
 * Walk the bracket table and return the gross tax before rebates plus the
 * marginal rate that applies to the income.
 *
 * @param {number} incomeCents - Annual taxable income in integer cents.
 * @param {Array}  brackets    - Sorted bracket rows from the data file.
 * @returns {{ taxBeforeRebateCents: number, marginalRateBps: number }}
 */
function calcGrossTax(incomeCents, brackets) {
  let bracket = brackets[0];
  for (const b of brackets) {
    if (incomeCents >= b.thresholdCents) bracket = b;
  }
  const taxBeforeRebateCents =
    bracket.baseTaxCents +
    Math.round((incomeCents - bracket.thresholdCents) * bracket.rateBps / 10000);
  return { taxBeforeRebateCents, marginalRateBps: bracket.rateBps };
}

/**
 * Return the total annual rebate in cents based on the taxpayer's age.
 *
 * @param {number} age
 * @param {{ primaryCents: number, secondaryCents: number, tertiaryCents: number }} rebates
 * @returns {number}
 */
function getRebateCents(age, rebates) {
  let total = rebates.primaryCents;
  if (age >= 65) total += rebates.secondaryCents;
  if (age >= 75) total += rebates.tertiaryCents;
  return total;
}

/**
 * Format a decimal ratio as a percentage string with two decimal places.
 * @param {number} ratio - e.g. 0.18
 * @returns {string} - e.g. "18.00%"
 */
function formatRate(ratio) {
  return (ratio * 100).toFixed(2) + '%';
}

/**
 * Estimate SARS 2026/27 individual income tax.
 *
 * Strategy: annualise the year-to-date net income (gross minus platform fee),
 * compute annual tax on that projected figure, then pro-rate back to the
 * elapsed period.  All arithmetic uses integer cents throughout.
 *
 * @param {object} opts
 * @param {number}  opts.grossCents            YTD (or full-year) gross income in integer cents.
 * @param {number}  [opts.ytdDays]             Days elapsed in the tax year so far.
 *                                             Omit (or equal taxYearDays) for a full-year figure.
 * @param {number}  [opts.taxYearDays]         Total days in the tax year (default: 365 from data).
 * @param {number}  [opts.age=30]              Taxpayer age – selects rebate tier.
 * @param {number}  [opts.platformFeeRateBps]  Override platform-fee rate (bps). Default from data.
 * @returns {{
 *   taxYear: string,
 *   grossCents: number,
 *   platformFeeRateBps: number,
 *   platformFeeCents: number,
 *   netCents: number,
 *   annualNetCents: number,
 *   taxBeforeRebateCents: number,
 *   rebateCents: number,
 *   annualTaxPayableCents: number,
 *   proratedTaxCents: number,
 *   effectiveRatePct: string,
 *   marginalRatePct: string,
 *   provisionalTax: {
 *     firstPaymentCents: number,
 *     secondPaymentCents: number,
 *     dates: { firstDeadline: string, secondDeadline: string, topUpDeadline: string }
 *   }
 * }}
 */
function estimateTax({
  grossCents,
  ytdDays = null,
  taxYearDays = null,
  age = 30,
  platformFeeRateBps: feeOverride = null,
} = {}) {
  if (!Number.isInteger(grossCents) || grossCents < 0) {
    throw new TypeError('grossCents must be a non-negative integer');
  }

  const data        = TAX_DATA;
  const totalDays   = taxYearDays ?? data.period.totalDays;
  const daysElapsed = ytdDays     ?? totalDays;

  if (!Number.isInteger(totalDays) || totalDays < 1) {
    throw new TypeError('taxYearDays must be a positive integer');
  }
  if (!Number.isInteger(daysElapsed) || daysElapsed < 1) {
    throw new TypeError('ytdDays must be a positive integer');
  }

  const feeRateBps      = feeOverride ?? data.platformFeeRateBps;
  const platformFeeCents = Math.round(grossCents * feeRateBps / 10000);
  const netCents         = grossCents - platformFeeCents;

  // Annualise YTD net income to a full-year projection
  const annualNetCents = daysElapsed < totalDays
    ? Math.round(netCents * totalDays / daysElapsed)
    : netCents;

  const { taxBeforeRebateCents, marginalRateBps } =
    calcGrossTax(annualNetCents, data.brackets);

  const rebateCents          = getRebateCents(age, data.rebates);
  const annualTaxPayableCents = Math.max(0, taxBeforeRebateCents - rebateCents);

  // Pro-rate back to the elapsed period
  const proratedTaxCents = daysElapsed < totalDays
    ? Math.round(annualTaxPayableCents * daysElapsed / totalDays)
    : annualTaxPayableCents;

  const effectiveRate = annualNetCents > 0
    ? annualTaxPayableCents / annualNetCents
    : 0;

  // IRP6: first payment = 50% of annual estimate; second = remainder
  const firstPaymentCents  = Math.round(annualTaxPayableCents / 2);
  const secondPaymentCents = annualTaxPayableCents - firstPaymentCents;

  return {
    taxYear:                  data.taxYear,
    grossCents,
    platformFeeRateBps:       feeRateBps,
    platformFeeCents,
    netCents,
    annualNetCents,
    taxBeforeRebateCents,
    rebateCents,
    annualTaxPayableCents,
    proratedTaxCents,
    effectiveRatePct:         formatRate(effectiveRate),
    marginalRatePct:          formatRate(marginalRateBps / 10000),
    provisionalTax: {
      firstPaymentCents,
      secondPaymentCents,
      dates: { ...data.provisionalTax },
    },
  };
}

module.exports = { estimateTax };
