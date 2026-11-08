'use strict';

/**
 * https://expressjs.com/en/4x/api/router/
 * https://swagger.io/specification/
 */

const express    = require('express');
const { authenticate, authorizeRoles } = require('../middleware/auth.middleware');
const meController = require('../controllers/me.controller');

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     ProvisionalTaxDates:
 *       type: object
 *       properties:
 *         firstDeadline:
 *           type: string
 *           format: date
 *           description: IRP6 first provisional payment deadline (50% of annual estimate)
 *           example: "2026-08-31"
 *         secondDeadline:
 *           type: string
 *           format: date
 *           description: IRP6 second provisional payment deadline (balance)
 *           example: "2027-02-28"
 *         topUpDeadline:
 *           type: string
 *           format: date
 *           description: Voluntary top-up deadline to avoid under-estimation penalty
 *           example: "2027-09-30"
 *
 *     ProvisionalTax:
 *       type: object
 *       properties:
 *         firstPaymentCents:
 *           type: integer
 *           description: 50% of the estimated annual tax payable, in cents
 *           example: 4140650
 *         secondPaymentCents:
 *           type: integer
 *           description: Remaining balance of estimated annual tax payable, in cents
 *           example: 4140650
 *         dates:
 *           $ref: '#/components/schemas/ProvisionalTaxDates'
 *
 *     TaxYearTaxEstimate:
 *       type: object
 *       properties:
 *         taxBeforeRebateCents:
 *           type: integer
 *           description: Gross tax computed from SARS brackets before any rebate, in cents
 *           example: 10063300
 *         rebateCents:
 *           type: integer
 *           description: Total annual rebate applied (primary + secondary + tertiary where applicable), in cents
 *           example: 1782000
 *         annualTaxPayableCents:
 *           type: integer
 *           description: Annual tax payable after rebate (annualised income projection), in cents
 *           example: 8281300
 *         proratedTaxCents:
 *           type: integer
 *           description: Tax pro-rated to the elapsed days in the tax year, in cents
 *           example: 4140650
 *         effectiveRatePct:
 *           type: string
 *           description: Effective tax rate on annual net income
 *           example: "18.40%"
 *         marginalRatePct:
 *           type: string
 *           description: Marginal SARS rate that applies to the top rand of annual net income
 *           example: "31.00%"
 *         provisionalTax:
 *           $ref: '#/components/schemas/ProvisionalTax'
 *
 *     TaxYearSummary:
 *       type: object
 *       properties:
 *         taxYear:
 *           type: string
 *           description: SARS tax-year label (1 March – last day of February)
 *           example: "2026/27"
 *         taxYearPeriod:
 *           type: object
 *           properties:
 *             start:
 *               type: string
 *               format: date
 *               example: "2026-03-01"
 *             end:
 *               type: string
 *               format: date
 *               example: "2027-02-28"
 *             totalDays:
 *               type: integer
 *               example: 365
 *             ytdDays:
 *               type: integer
 *               description: Days elapsed in this tax year as of request time
 *               example: 252
 *         transactionCount:
 *           type: integer
 *           example: 5
 *         grossIncomeCents:
 *           type: integer
 *           description: Sum of completed transaction amounts (in rand) converted to cents
 *           example: 50000000
 *         platformFeeRateBps:
 *           type: integer
 *           description: Platform fee rate in basis points (10 000 = 100%)
 *           example: 1000
 *         platformFeeCents:
 *           type: integer
 *           example: 5000000
 *         netIncomeCents:
 *           type: integer
 *           description: Gross income minus platform fee, in cents
 *           example: 45000000
 *         annualNetIncomeCents:
 *           type: integer
 *           description: Net income annualised from YTD figure, in cents
 *           example: 45000000
 *         taxEstimate:
 *           $ref: '#/components/schemas/TaxYearTaxEstimate'
 *
 *     IncomeSummaryResponse:
 *       type: object
 *       properties:
 *         freelancerId:
 *           type: string
 *           description: MongoDB ObjectId of the authenticated freelancer
 *           example: "507f1f77bcf86cd799439011"
 *         generatedAt:
 *           type: string
 *           format: date-time
 *           description: UTC timestamp when this response was generated
 *         summary:
 *           type: array
 *           description: Tax-year groups, sorted ascending by tax year
 *           items:
 *             $ref: '#/components/schemas/TaxYearSummary'
 */

/**
 * @swagger
 * /api/me/income-summary:
 *   get:
 *     summary: Get the authenticated freelancer's income summary with SARS 2026/27 tax estimates
 *     description: >
 *       Returns all Completed transactions grouped by SARS tax year (South Africa Standard
 *       Time, UTC+2). Each group includes gross income, the HustleHub+ platform-fee deduction,
 *       net income, and a full SARS 2026/27 tax estimate. The estimate annualises the
 *       year-to-date net income and then pro-rates back to the elapsed period.
 *       Provisional-tax (IRP6) payment amounts and SARS deadlines are included.
 *       Requires a valid JWT and the freelancer role.
 *       Always responds with Cache-Control: no-store.
 *     tags: [Me]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Income summary grouped by SARS tax year
 *         headers:
 *           Cache-Control:
 *             description: Always "no-store" – do not cache financial data
 *             schema:
 *               type: string
 *               example: no-store
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/IncomeSummaryResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get(
  '/income-summary',
  authenticate,
  authorizeRoles('freelancer'),
  meController.incomeSummary,
);

module.exports = router;
