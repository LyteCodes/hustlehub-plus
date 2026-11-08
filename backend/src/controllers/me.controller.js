'use strict';

/**
 * @file me.controller.js
 * @description Controller for the authenticated freelancer's self-service endpoints.
 * GET /api/me/income-summary aggregates completed transactions by SARS tax year
 * (South Africa Standard Time, UTC+2) and attaches a SARS 2026/27 tax estimate
 * to each year.
 *
 * https://www.sars.gov.za/tax-rates/income-tax/rates-of-tax-for-individuals/
 * https://expressjs.com/en/guide/writing-middleware/
 */

const Transaction = require('../models/transaction');
const { estimateTax } = require('../lib/estimateTax');

// SAST = UTC+2 (no daylight-saving offset in South Africa)
const SAST_OFFSET_MS = 2 * 60 * 60 * 1000;

/**
 * Shift a UTC Date into SAST by adding the fixed UTC+2 offset.
 * @param {Date} date
 * @returns {Date} A new Date whose UTC fields read as SAST local values.
 */
function toSAST(date) {
  return new Date(date.getTime() + SAST_OFFSET_MS);
}

/**
 * Derive the SARS tax-year label for a given date.
 * The South African tax year runs 1 March – last day of February.
 *
 * @param {Date} date
 * @returns {string} e.g. "2026/27"
 */
function getSARSTaxYearLabel(date) {
  const sast  = toSAST(date);
  const year  = sast.getUTCFullYear();
  const month = sast.getUTCMonth() + 1; // 1-indexed
  if (month >= 3) {
    return `${year}/${String(year + 1).slice(2)}`;
  }
  return `${year - 1}/${String(year).slice(2)}`;
}

/**
 * Return the UTC-epoch boundaries and total-day count for a SARS tax-year label.
 *
 * @param {string} label  e.g. "2026/27"
 * @returns {{ startUTC: number, endUTC: number, totalDays: number }}
 */
function taxYearBoundaries(label) {
  const startYear = parseInt(label.split('/')[0], 10);
  const endYear   = startYear + 1;

  // March 1 of startYear at 00:00 SAST, expressed as UTC epoch ms
  const startUTC = Date.UTC(startYear, 2, 1) - SAST_OFFSET_MS;

  // Check whether the tax-year end falls in a leap year
  const isLeap     = endYear % 4 === 0 && (endYear % 100 !== 0 || endYear % 400 === 0);
  const febLastDay = isLeap ? 29 : 28;
  const totalDays  = isLeap ? 366 : 365;

  // Last ms of the final February day in endYear, expressed as UTC epoch ms
  const endUTC = Date.UTC(endYear, 1, febLastDay, 23, 59, 59, 999) - SAST_OFFSET_MS;

  return { startUTC, endUTC, totalDays };
}

/**
 * Calculate how many days have elapsed in the given tax year as of `nowMs`.
 * Returns `totalDays` once the year has ended. Returns 1 (minimum) on the
 * opening day to prevent division-by-zero in annualisation.
 *
 * @param {string} label
 * @param {number} [nowMs=Date.now()]
 * @returns {number}
 */
function getYtdDays(label, nowMs = Date.now()) {
  const { startUTC, endUTC, totalDays } = taxYearBoundaries(label);
  if (nowMs >= endUTC)  return totalDays;
  if (nowMs < startUTC) return 1;
  return Math.max(1, Math.floor((nowMs - startUTC) / (24 * 60 * 60 * 1000)));
}

/**
 * GET /api/me/income-summary
 *
 * Returns the authenticated freelancer's completed transactions grouped by
 * SARS tax year (SAST). Each group includes gross income, platform-fee
 * deduction, net income, and a SARS 2026/27 tax estimate (annualised + pro-rated).
 * Sets Cache-Control: no-store to prevent sensitive financial data from being
 * stored in any cache.
 *
 * @param {import('express').Request}  req  - req.user.id populated by authenticate middleware
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
exports.incomeSummary = async (req, res, next) => {
  try {
    const freelancerId = req.user.id;

    const transactions = await Transaction.find({
      freelancer: freelancerId,
      status: 'Completed',
    })
      .lean()
      .exec();

    // Group completed transactions by SARS tax year (SAST)
    const groups = new Map();
    for (const tx of transactions) {
      const label = getSARSTaxYearLabel(tx.createdAt);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(tx);
    }

    const summary = [];
    for (const [label, txs] of groups.entries()) {
      // Convert rand amounts to integer cents (amounts stored as Number in rand)
      const grossCents = txs.reduce((sum, tx) => sum + Math.round(tx.amount * 100), 0);

      const { totalDays } = taxYearBoundaries(label);
      const ytdDays       = getYtdDays(label);

      const tax = estimateTax({ grossCents, ytdDays, taxYearDays: totalDays });

      const { startUTC, endUTC } = taxYearBoundaries(label);

      summary.push({
        taxYear: label,
        taxYearPeriod: {
          start:     new Date(startUTC + SAST_OFFSET_MS).toISOString().slice(0, 10),
          end:       new Date(endUTC   + SAST_OFFSET_MS + 1).toISOString().slice(0, 10),
          totalDays,
          ytdDays,
        },
        transactionCount:    txs.length,
        grossIncomeCents:    grossCents,
        platformFeeRateBps:  tax.platformFeeRateBps,
        platformFeeCents:    tax.platformFeeCents,
        netIncomeCents:      tax.netCents,
        annualNetIncomeCents: tax.annualNetCents,
        taxEstimate: {
          taxBeforeRebateCents:   tax.taxBeforeRebateCents,
          rebateCents:            tax.rebateCents,
          annualTaxPayableCents:  tax.annualTaxPayableCents,
          proratedTaxCents:       tax.proratedTaxCents,
          effectiveRatePct:       tax.effectiveRatePct,
          marginalRatePct:        tax.marginalRatePct,
          provisionalTax:         tax.provisionalTax,
        },
      });
    }

    // Chronological order
    summary.sort((a, b) => a.taxYear.localeCompare(b.taxYear));

    res.set('Cache-Control', 'no-store');
    return res.status(200).json({
      freelancerId,
      generatedAt: new Date().toISOString(),
      summary,
    });
  } catch (error) {
    next(error);
  }
};
