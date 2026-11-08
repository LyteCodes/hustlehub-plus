const express = require("express");
const { authenticate, authorizeRoles} = require("../middleware/auth.middleware");
const { bookingValidation } = require("../middleware/validation.middleware");
const bookingController = require("../controllers/booking.controller");
const { bookingRateLimiter } = require("../middleware/rate-limit.middleware");

const router = express.Router();

/**
 * @swagger
 * /api/bookings/mine:
 *   get:
 *     summary: Get the authenticated user's bookings
 *     description: Returns all bookings where the authenticated user is the client or freelancer. Requires a valid JWT and the client or freelancer role.
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The freelancer's bookings (empty array if none)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 bookings:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Booking'
 */
router.get(
    "/mine",
    authenticate,
    authorizeRoles("freelancer", "client"),
    bookingController.mine
)

/**
 * @swagger
 * /api/bookings/{id}:
 *   get:
 *     summary: Get booking details by ID
 *     description: Returns the details of a specific booking by its ID. Requires a valid JWT and the client or freelancer role.
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The booking ID
 *     responses:
 *       200:
 *         description: The booking details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Booking'
 *       404:
 *         description: Booking not found
 */
router.get(
    "/:id",
    authenticate,
    authorizeRoles("freelancer", "client"),
    bookingController.detail
)

/**
 * @swagger
 * /api/bookings/{id}/complete:
 *   patch:
 *     summary: Complete a booking
 *     description: Updates the status of a booking to "Completed" and the associated transaction to "Completed".
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The booking ID
 *     responses:
 *       200:
 *         description: The updated booking
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Booking'
 *       404:
 *         description: Booking not found
 */
router.patch(
    "/:id/complete",
    authenticate,
    authorizeRoles("freelancer"),
    bookingController.complete
)

/**
 * @swagger
 * /api/bookings:
 *   post:
 *     summary: Create a new booking
 *     description: Creates a new booking for the authenticated client
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Booking'
 *     responses:
 *       201:
 *         description: The booking was successfully created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Booking'
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(
    "/",
    authenticate,
    authorizeRoles("client"),
    bookingRateLimiter,
    bookingValidation,
    bookingController.create
)
module.exports = router;

/**
 * @swagger
 * /api/bookings/{id}/cancel:
 *   patch:
 *     summary: Cancel a booking
 *     description: Updates the status of a booking to "Cancelled" and the associated transaction to "Refunded".
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The booking ID
 *     responses:
 *       200:
 *         description: The updated booking
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Booking'
 *       404:
 *         description: Booking not found
 */
router.patch(
    "/:id/cancel",
    authenticate,
    authorizeRoles("client"),
    bookingController.cancel
)
