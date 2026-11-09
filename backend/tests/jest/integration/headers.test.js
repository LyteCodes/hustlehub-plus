'use strict';

const crypto = require('crypto');

process.env.JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
process.env.NODE_ENV   = 'test';

jest.mock('../../../src/config/db', () => jest.fn());
jest.mock('../../../src/lib/logger', () => ({
  info:  jest.fn(),
  warn:  jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const request  = require('supertest');
const mongoose = require('mongoose');
const jwt      = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET;

function makeToken(id, role) {
  return jwt.sign({ sub: id.toString(), role }, SECRET, { expiresIn: '1h' });
}

let app;

beforeAll(async () => {
  const os = require('os');
  await mongoose.connect(process.env.MONGO_MEM_URI, { runtimeAdapters: { os } });
  app = require('../../../src/app');
});

afterEach(async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})),
  );
});

afterAll(async () => {
  await mongoose.disconnect();
});

// Cache-Control: no-store 
describe('Cache-Control: no-store on /api/me/income-summary', () => {
  test('200 response includes Cache-Control: no-store header', async () => {
    const id    = new mongoose.Types.ObjectId();
    const token = makeToken(id, 'freelancer');

    const res = await request(app)
      .get('/api/me/income-summary')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toMatch(/no-store/);
  });
});

// Helmet security headers 
describe('Helmet security headers on all responses', () => {

  test('x-content-type-options: nosniff is present on API routes', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'Valid#Pass1' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  test('x-frame-options is present on API routes (Helmet frameguard)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'Valid#Pass1' });
    expect(res.headers['x-frame-options']).toBeDefined();
  });

  test('x-powered-by header is NOT present (disabled globally)', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  test('authenticated route also includes Helmet headers', async () => {
    const id    = new mongoose.Types.ObjectId();
    const token = makeToken(id, 'freelancer');

    const res = await request(app)
      .get('/api/me/income-summary')
      .set('Authorization', `Bearer ${token}`);

    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
