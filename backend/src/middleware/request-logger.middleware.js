'use strict';

/**
 * @file request-logger.middleware.js
 * @description Express middleware that logs one structured JSON record per
 * HTTP request on the response "finish" event.
 *
 * Level selection:
 *   5xx → error   (unexpected server fault)
 *   4xx → warn    (bad request, auth failure, etc.)
 *   2xx/3xx → info
 *
 * https://expressjs.com/en/guide/writing-middleware/
 */

const logger = require('../lib/logger');

/**
 * Attach a "finish" listener that emits one log record after the response
 * headers are flushed. Never throws or interrupts the response pipeline.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function requestLogger(req, res, next) {
  const startMs = Date.now();

  res.on('finish', () => {
    const durationMs  = Date.now() - startMs;
    const { statusCode } = res;

    const level = statusCode >= 500 ? 'error'
                : statusCode >= 400 ? 'warn'
                : 'info';

    logger[level]('HTTP request', {
      event:      'http.request',
      method:     req.method,
      path:       req.path,
      url:        req.originalUrl,
      statusCode,
      durationMs,
      ip:         req.ip,
      userAgent:  req.get('user-agent') || '',
      userId:     req.user?.id  ?? null,
      userRole:   req.user?.role ?? null,
    });
  });

  next();
}

module.exports = { requestLogger };
