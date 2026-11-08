'use strict';

/**
 * @file logger.js
 * @description Structured JSON logger (Winston) with an OTLP/HTTP transport
 * for Grafana Cloud Loki.
 *
 * Required environment variables for the OTLP transport (see
 * backend/secrets/grafana-cloud.env.example):
 *   GRAFANA_OTLP_ENDPOINT   – e.g. https://otlp-gateway-prod-eu-west-0.grafana.net/otlp
 *   GRAFANA_OTLP_INSTANCE_ID – numeric Grafana Cloud instance / stack ID
 *   GRAFANA_OTLP_API_KEY     – Grafana Cloud API key (grafana.com token)
 *
 * When any credential is absent the transport is silently skipped so
 * development works without Grafana credentials.
 *
 * https://opentelemetry.io/docs/specs/otlp/#otlphttp-logs
 * https://grafana.com/docs/grafana-cloud/send-data/otlp/
 * https://www.npmjs.com/package/winston
 */

const os = require('os');
const winston = require('winston');
const Transport = require('winston-transport');

// ── OTLP severity mapping ──────────────────────────────────────────────────
const SEVERITY = {
  error: { number: 17, text: 'ERROR' },
  warn:  { number: 13, text:  'WARN' },
  info:  { number:  9, text:  'INFO' },
  http:  { number:  9, text:  'INFO' },
  debug: { number:  5, text: 'DEBUG' },
};

/** Convert a plain JS value to an OTLP AnyValue object. */
function toAnyValue(value) {
  if (value === null || value === undefined) return { stringValue: '' };
  if (typeof value === 'boolean')            return { boolValue: value };
  if (typeof value === 'number')             return Number.isInteger(value)
    ? { intValue: String(value) }   // int64 as string per OTLP JSON spec
    : { doubleValue: value };
  if (typeof value === 'object')             return { stringValue: JSON.stringify(value) };
  return { stringValue: String(value) };
}

/** Convert a flat key-value map to an OTLP attributes array. */
function toAttributes(map) {
  return Object.entries(map).map(([key, value]) => ({ key, value: toAnyValue(value) }));
}

// ── Custom OTLP Winston Transport ──────────────────────────────────────────

class OtlpTransport extends Transport {
  /**
   * @param {object}  opts
   * @param {string}  opts.endpoint     OTLP base URL (no trailing slash, no /v1/logs)
   * @param {string}  opts.instanceId   Grafana Cloud stack / instance ID
   * @param {string}  opts.apiKey       Grafana Cloud API key
   * @param {string}  [opts.service]    service.name resource attribute
   * @param {string}  [opts.env]        deployment.environment
   * @param {number}  [opts.flushMs=5000]  auto-flush interval in ms
   * @param {number}  [opts.batchSize=50]  max records per flush
   */
  constructor(opts = {}) {
    super(opts);
    this._endpoint   = opts.endpoint.replace(/\/$/, '') + '/v1/logs';
    this._auth       = Buffer.from(`${opts.instanceId}:${opts.apiKey}`).toString('base64');
    this._resource   = toAttributes({
      'service.name':              opts.service || 'hustlehub-plus-api',
      'service.version':           process.env.npm_package_version || '1.0.0',
      'deployment.environment':    opts.env || process.env.NODE_ENV || 'development',
      'host.name':                 os.hostname(),
    });
    this._queue      = [];
    this._batchSize  = opts.batchSize  || 50;
    this._flushMs    = opts.flushMs    || 5_000;
    this._timer      = setInterval(() => this._flush(), this._flushMs);
    // Allow the process to exit without waiting for the timer
    if (this._timer.unref) this._timer.unref();
  }

  /** Called by Winston for each log record. */
  log(info, callback) {
    setImmediate(() => this.emit('logged', info));
    this._queue.push(info);
    if (this._queue.length >= this._batchSize) this._flush();
    callback();
  }

  /** Drain remaining records on graceful shutdown. */
  close() {
    clearInterval(this._timer);
    return this._flush();
  }

  async _flush() {
    if (this._queue.length === 0) return;
    const batch = this._queue.splice(0, this._batchSize);

    const logRecords = batch.map((info) => {
      const { level, message, timestamp, ...rest } = info;
      const sev = SEVERITY[level] || SEVERITY.info;
      const timeNs = timestamp
        ? String(new Date(timestamp).getTime()) + '000000'
        : String(Date.now()) + '000000';

      return {
        timeUnixNano:   timeNs,
        observedTimeUnixNano: timeNs,
        severityNumber: sev.number,
        severityText:   sev.text,
        body:           { stringValue: message },
        attributes:     toAttributes(rest),
      };
    });

    const body = {
      resourceLogs: [{
        resource:   { attributes: this._resource },
        scopeLogs: [{
          scope: { name: 'hustlehub-plus' },
          logRecords,
        }],
      }],
    };

    try {
      await fetch(this._endpoint, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${this._auth}`,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      // Never crash on transport failure; surface as a warning so the app
      // can keep running even when Grafana Cloud is unreachable
      this.emit('warn', new Error(`OTLP flush failed: ${err.message}`));
    }
  }
}

// ── Build the logger ───────────────────────────────────────────────────────

const { combine, timestamp, json, colorize, simple, errors } = winston.format;

/** Base format: ISO timestamp + full error stack + JSON. */
const jsonFormat = combine(
  errors({ stack: true }),
  timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
  json(),
);

const transports = [];

// Always log to stdout – pretty in dev, JSON in production
if (process.env.NODE_ENV !== 'production') {
  transports.push(
    new winston.transports.Console({
      format: combine(colorize(), simple()),
    }),
  );
} else {
  transports.push(new winston.transports.Console({ format: jsonFormat }));
}

// OTLP transport for Grafana Cloud (enabled when all three credentials exist)
const { GRAFANA_OTLP_ENDPOINT, GRAFANA_OTLP_INSTANCE_ID, GRAFANA_OTLP_API_KEY } = process.env;
if (GRAFANA_OTLP_ENDPOINT && GRAFANA_OTLP_INSTANCE_ID && GRAFANA_OTLP_API_KEY) {
  transports.push(
    new OtlpTransport({
      endpoint:   GRAFANA_OTLP_ENDPOINT,
      instanceId: GRAFANA_OTLP_INSTANCE_ID,
      apiKey:     GRAFANA_OTLP_API_KEY,
      env:        process.env.NODE_ENV,
    }),
  );
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: jsonFormat,
  transports,
  // Forward unhandled rejections / exceptions to the logger
  exceptionHandlers:  transports,
  rejectionHandlers:  transports,
});

module.exports = logger;
