/**
 * @file auth.middleware.js
 * @description Authentication and authorization middleware: verifies Bearer JWTs
 * and restricts routes to allowed roles.
 * Code based on the following source:
 *
 * https://www.npmjs.com/package/jsonwebtoken
 * https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Authorization
 * https://expressjs.com/en/guide/writing-middleware/
 * https://www.rfc-editor.org/rfc/rfc8725 (JWT best practices: pin the algorithm)
 */

const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const config = require("../config");
const logger = require("../lib/logger");

const ALLOWED_ROLES = ["freelancer", "client", "admin"];

/**
 * Send the generic 401. Every authentication failure gets the same body, so a
 * caller can't tell a missing token from a forged or expired one.
 * @param {Object} res - The response object.
 * @returns {Object} The response.
 */
const unauthorized = (res) =>
  res.status(401).json({
    error: { code: "UNAUTHORIZED", message: "Authentication required." },
  });

/**
 * Send the generic 403 for an authenticated user without the required role.
 * @param {Object} res - The response object.
 * @returns {Object} The response.
 */
const forbidden = (res) =>
  res.status(403).json({
    error: {
      code: "FORBIDDEN",
      message: "You do not have permission to do that.",
    },
  });

/**
 * Verify the Bearer token in the Authorization header and attach the identity
 * to req.user. Responds 401 for missing, expired, or invalid tokens.
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {Function} next - The next middleware function.
 * @returns {void}
 */
const authenticate = (req, res, next) => {
  const header = req.headers.authorization;
  if (typeof header !== "string" || !header.startsWith("Bearer "))
    return unauthorized(res);

  try {
    // Pin the algorithm: tokens using "none" or any other algorithm are rejected
    const decoded = jwt.verify(header.slice(7), config.jwt.secret, {
      algorithms: [config.jwt.algorithm],
    });

    // Claims must be plain values of the expected shape, so an object in
    // sub/role can never reach a MongoDB query as an operator
    if (
      typeof decoded.sub !== "string" ||
      !mongoose.Types.ObjectId.isValid(decoded.sub) ||
      !ALLOWED_ROLES.includes(decoded.role)
    )
      return unauthorized(res);

    req.user = { id: decoded.sub, role: decoded.role };
    return next();
  } catch {
    return unauthorized(res);
  }
};

/**
 * Build role-based authorization middleware.
 * @param {...string} allowedRoles - The roles permitted to pass through.
 * @returns {Function} A middleware that responds 403 when the role is not allowed.
 */
const authorizeRoles =
  (...allowedRoles) =>
  (req, res, next) => {
    if (!req.user) return unauthorized(res);
    if (!allowedRoles.includes(req.user.role)) {
      logger.warn("Access denied", {
        event: "security.access_denied",
        userId: req.user.id,
        userRole: req.user.role,
        allowedRoles,
        method: req.method,
        path: req.path,
        ip: req.ip,
      });
      return forbidden(res);
    }
    return next();
  };

module.exports = { authenticate, authorizeRoles, unauthorized, forbidden };
