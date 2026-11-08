const mongoose = require("mongoose");
const Booking = require("../models/booking");
const Gig = require("../models/gig");
const Transaction = require("../models/transaction");
const logger = require("../lib/logger");

/**
 * Create a new booking for a gig.
 * - Validate the request body for required fields and data types.
 * - Check if the gig exists and is available for booking.
 * - Create a new booking with the provided gig ID, client ID (from the authenticated user), freelancer ID (from the gig), and optional notes.
 * - Create a Pending transaction for the booking.
 * - Return a 201 Created response with the booking details if successful, or an appropriate error response if validation fails or the gig is not available.
 * 
 * @param {Object} req - The request object containing the booking details in the body.
 * @param {Object} res - The response object used to send back the result of the booking creation.
 * @param {Function} next - The next middleware function to handle errors or pass control to the next route handler.
 */
exports.create = async (req, res, next) => {
    try {
        /**
         * Validate the request body for creating a booking.
         * - gig: required, must be a valid MongoDB ObjectId.
         * - notes: optional, must be a string and not exceed 500 characters.
         */
        const { gig, notes } = req.body;
        if (!mongoose.Types.ObjectId.isValid(gig)) {
            return res.status(400).json({
                error: {
                    code: "VALIDATION_ERROR",
                    message: "Gig ID must be a valid MongoDB ObjectId",
                },
            });
        }
        /**
         * Check if the gig exists and is available for booking.
         * If the gig does not exist or is not available, return an appropriate error response.
         */
        const gigExists = await Gig.findById(gig).exec();
        if (!gigExists) {
            return res.status(404).json({
                error: {
                    code: "NOT_FOUND",
                    message: "Gig not found",
                },
            });
        }

        if (gigExists.status !== "Active") {
            return res.status(400).json({
                error: {
                    code: "GIG_UNAVAILABLE",
                    message: "This gig is not available for booking. Please choose another gig.",
                },
            });
        }

        console.log("BOOKING DEBUG", require("mongoose").version, Booking.schema.path("status").instance, Object.keys(Booking.schema.path("status").$conditionalHandlers));

        const openBooking = await Booking.findOne({
            gig: gigExists._id,
            client: req.user.id,
            status: { $in: ["Pending", "Confirmed"] },
        }).exec();

        if (openBooking) {
            return res.status(409).json({
                error: {
                    code: "DUPLICATE_BOOKING",
                    message: "You already have an open booking for this gig.",
                },
            });
        }
        /**
         * Create a new booking with the provided gig ID, client ID (from the authenticated user), freelancer ID (from the gig), and optional notes.
         * The booking status is set to "Confirmed" upon creation.
         * If the booking is created successfully, return a 201 Created response with the booking details.
         */
        const booking = await Booking.create({
            gig: gigExists._id,
            client: req.user.id,
            freelancer: gigExists.freelancer,
            notes,
            status: "Confirmed",
        });

        /**
         * Create a Pending transaction for the booking.
         * The amount is derived from the gig rate, while the booking, client,
         * and freelancer IDs are derived from the created booking.
         */
        const transaction = await Transaction.create({
            booking: booking._id,
            client: booking.client,
            freelancer: booking.freelancer,
            amount: gigExists.rate,
            status: "Pending",
        });

        logger.info("Booking created", {
            event: "booking.created",
            bookingId:    String(booking._id),
            gigId:        String(gigExists._id),
            clientId:     String(booking.client),
            freelancerId: String(booking.freelancer),
            amountRand:   gigExists.rate,
        });

        logger.info("Transaction recorded", {
            event:         "transaction.recorded",
            transactionId: String(transaction._id),
            bookingId:     String(booking._id),
            clientId:      String(transaction.client),
            freelancerId:  String(transaction.freelancer),
            amountRand:    transaction.amount,
            status:        transaction.status,
        });

        res.status(201).json({
            message: "Booking created successfully",
            booking,
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Get all bookings for the current user.
 * - Fetch all bookings where the freelancer ID matches the authenticated user's ID.
 * - Return a 200 OK response with the list of bookings if successful, or an appropriate error response if an error occurs.
 * 
 * @param {*} req 
 * @param {*} res 
 * @param {*} next 
 * @returns 
 */
exports.mine = async (req, res, next) => {
    try {
        const field = req.user.role === "client" ? "client" : "freelancer";
        const bookings = await Booking.find({ [field]: req.user.id }).exec();

        return res.status(200).json({bookings});
    } catch (error) {
        next(error);
    }
};
/**
 * Get the details of a specific booking by ID.
 * - Validate the booking ID from the request parameters.
 * - Fetch the booking where the ID matches and either the client or freelancer ID matches the authenticated user's ID.
 * - Return a 200 OK response with the booking details if found, or an appropriate error response if not found or if an error occurs.
 *
 * @param {*} req
 * @param {*} res
 * @param {*} next
 * @returns
 */
exports.detail = async (req, res, next) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(404).json({ error: { code: "NOT_FOUND", message: "Booking not found" } });
        }

        const booking = await Booking.findOne({
            _id: req.params.id,
            $or: [{ client: req.user.id }, { freelancer: req.user.id }],
        }).exec();

        if (!booking) {
            return res.status(404).json({ error: { code: "NOT_FOUND", message: "Booking not found" } });
        }

        return res.status(200).json({ booking });
    } catch (error) {
        next(error);
    }
};
/**
 * Complete a booking.
 * - Validate the booking ID from the request parameters.
 * - Fetch the booking where the ID matches and the freelancer ID matches the authenticated user's ID.
 * - Update the booking status to "Completed" and update the associated transaction status to "Completed".
 * - Return a 200 OK response with the updated booking if successful, or an appropriate error response if not found or if an error occurs.
 *
 * @param {*} req
 * @param {*} res
 * @param {*} next
 * @returns
 */
exports.complete = async (req, res, next) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(404).json({ error: { code: "NOT_FOUND", message: "Booking not found" } });
        }

        const booking = await Booking.findOne({
            _id: req.params.id,
            freelancer: req.user.id,
        }).exec();

        if (!booking) {
            return res.status(404).json({ error: { code: "NOT_FOUND", message: "Booking not found" } });
        }

        booking.status = "Completed";
        await booking.save();

        await Transaction.findOneAndUpdate(
            { booking: booking._id },
            { status: "Completed" }
        ).exec();

        return res.status(200).json({ booking });
    } catch (error) {
        next(error);
    }
};

// Cancel a booking.
exports.cancel = async (req, res, next) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(404).json({ error: { code: "NOT_FOUND", message: "Booking not found" } });
        }

        const booking = await Booking.findOne({
            _id: req.params.id,
            client: req.user.id,
        }).exec();

        if (!booking) {
            return res.status(404).json({ error: { code: "NOT_FOUND", message: "Booking not found" } });
        }

        booking.status = "Cancelled";
        await booking.save();

        await Transaction.findOneAndUpdate(
            { booking: booking._id },
            { status: "Refunded" }
        ).exec();

        return res.status(200).json({ booking });
    } catch (error) {
        next(error);
    }
};
