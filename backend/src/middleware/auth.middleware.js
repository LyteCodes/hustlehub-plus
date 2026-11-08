/**
 * https://www.npmjs.com/package/jsonwebtoken
 * https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Authorization
 * https://expressjs.com/en/guide/writing-middleware/
 */

const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const config = require("../config");
const logger = require("../lib/logger");
const ALLOWED_ROLES = ['freelancer', 'client', 'admin'];

/**
 * Verify the Bearer token in the Authorization header and attach the identity
 * to req.user. Responds 401 for missing, expired, or invalid tokens.
 * @param {Object} 
 * @param {Object} 
 * @param {Function}
 * @returns {void}
 */
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;

  // Check header exists and uses "Bearer <token>" schema
  if (!authHeader || !authHeader.startsWith("Bearer "))
    return res.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication token missing or malformed.",
      },
    });

  const token = authHeader.split(" ")[1];

  try {
    // Verify sig & check exp using JWT_SECRET
    const decoded = jwt.verify(token, config.jwt.secret);

    // Reject tokens whose claims are not plain strings of the expected shape.
    // jwt.verify() only checks the signature — a crafted token with a valid
    // signature could carry an object in sub/role, which would flow into
    // MongoDB queries as an operator injection vector.
    if (
      typeof decoded.sub !== 'string' ||
      !mongoose.Types.ObjectId.isValid(decoded.sub) ||
      !ALLOWED_ROLES.includes(decoded.role)
    ) {
      return res.status(401).json({
        error: { code: 'INVALID_TOKEN', message: 'Invalid authentication token.' },
      });
    }

    // Attach standard identity payload to request object
    req.user = { id: decoded.sub, role: decoded.role };

    next();
  } catch (err) {
    // Distinguish exp from other errors without leaking internals
    if (err.name == "TokenExpiredError")
      return res.status(401).json({
        error: {
          code: "TOKEN_EXPIRED",
          message: "Token has expired. Please log in again.",
        },
      });

    return res.status(401).json({
      error: {
        code: "INVALID_TOKEN",
        message: "Invalid authentication token.",
      },
    });
  }
};

/**
 * Build role-based authorization middleware.
 * @param {...string} allowedRoles - The roles permitted to pass through.
 * @returns {Function} A middleware that responds 403 when the role is not allowed.
 */
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if(!req.user){
      return res.status(401).json({ message: "Unauthorized access" });
    }

    if (!allowedRoles.includes(req.user.role)) {
      logger.warn("Access denied", {
        event:         "security.access_denied",
        userId:        req.user.id,
        userRole:      req.user.role,
        allowedRoles,
        method:        req.method,
        path:          req.path,
        ip:            req.ip,
      });
      return res.status(403).json({ error: "Access denied" });
    }
    next();
  };
};


module.exports = { authenticate, authorizeRoles };
