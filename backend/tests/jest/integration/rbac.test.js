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

function makeToken(role) {
  return jwt.sign(
    { sub: new mongoose.Types.ObjectId().toString(), role },
    SECRET,
    { expiresIn: '1h' },
  );
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

//Freelancer-only routes
describe('freelancer-only routes', () => {
  test('GET /api/bookings/mine → 200 for client', async () => {
    const res = await request(app)
      .get('/api/bookings/mine')
      .set('Authorization', `Bearer ${makeToken('client')}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.bookings)).toBe(true);
});


  test('GET /api/gigs/mine → 403 for client', async () => {
    const res = await request(app)
      .get('/api/gigs/mine')
      .set('Authorization', `Bearer ${makeToken('client')}`);
    expect(res.status).toBe(403);
  });

  test('GET /api/me/income-summary → 403 for client', async () => {
    const res = await request(app)
      .get('/api/me/income-summary')
      .set('Authorization', `Bearer ${makeToken('client')}`);
    expect(res.status).toBe(403);
  });
});

// Client-only routes
describe('client-only routes', () => {
  const validGigId = new mongoose.Types.ObjectId().toString();

  test('POST /api/bookings → 403 for freelancer', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${makeToken('freelancer')}`)
      .send({ gig: validGigId });
    expect(res.status).toBe(403);
  });
});

// Unauthenticated
describe('unauthenticated access', () => {
  test('GET /api/bookings/mine → 401 with no token', async () => {
    const res = await request(app).get('/api/bookings/mine');
    expect(res.status).toBe(401);
  });

  test('GET /api/gigs/mine → 401 with no token', async () => {
    const res = await request(app).get('/api/gigs/mine');
    expect(res.status).toBe(401);
  });

  test('GET /api/me/income-summary → 401 with no token', async () => {
    const res = await request(app).get('/api/me/income-summary');
    expect(res.status).toBe(401);
  });

  test('POST /api/bookings → 401 with no token', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .send({ gig: new mongoose.Types.ObjectId().toString() });
    expect(res.status).toBe(401);
  });

  test('GET /api/auth/me → 401 with no token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});
