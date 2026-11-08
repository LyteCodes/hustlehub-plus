'use strict';

process.env.JWT_SECRET = 'jest-booking-test-secret';
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

const SECRET = 'jest-booking-test-secret';

function makeToken(id, role) {
  return jwt.sign({ sub: id.toString(), role }, SECRET, { expiresIn: '1h' });
}

let app;
let Gig;
let Transaction;
let Booking;

beforeAll(async () => {
  const os = require('os');
  await mongoose.connect(process.env.MONGO_MEM_URI, { runtimeAdapters: { os } });
  app         = require('../../../src/app');
  Gig         = require('../../../src/models/gig');
  Transaction = require('../../../src/models/transaction');
  Booking     = require('../../../src/models/booking');
});

afterEach(async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})),
  );
});

afterAll(async () => {
  await mongoose.disconnect();
});

// helpers 
async function createActiveGig(freelancerId) {
  return Gig.create({
    freelancer:    freelancerId,
    title:         'Web Development Service',
    category:      'Development',
    description:   'Professional web development.',
    rate:          1500,
    durationHours: 8,
    status:        'Active',
  });
}

async function createPausedGig(freelancerId) {
  return Gig.create({
    freelancer:    freelancerId,
    title:         'Paused Design Service',
    category:      'Design',
    description:   'Currently unavailable.',
    rate:          800,
    durationHours: 4,
    status:        'Paused',
  });
}

// ── POST /api/bookings ────────────────────────────────────────────────────────

describe('POST /api/bookings', () => {
  test('201: creates booking and a Pending transaction for an active gig', async () => {
    const freelancerId = new mongoose.Types.ObjectId();
    const clientId     = new mongoose.Types.ObjectId();
    const gig          = await createActiveGig(freelancerId);
    const token        = makeToken(clientId, 'client');

    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ gig: gig._id.toString() });

    expect(res.status).toBe(201);
    expect(res.body.booking).toBeDefined();
    expect(res.body.booking.status).toBe('Confirmed');
    expect(res.body.booking.gig).toBe(gig._id.toString());

    // A Pending transaction must exist for this booking
    const bookingId = res.body.booking._id;
    const tx = await Transaction.findOne({ booking: bookingId });
    expect(tx).not.toBeNull();
    expect(tx.status).toBe('Pending');
    expect(tx.amount).toBe(gig.rate);
  });

  test('404 when the gig does not exist', async () => {
    const clientId = new mongoose.Types.ObjectId();
    const token    = makeToken(clientId, 'client');
    const fakeId   = new mongoose.Types.ObjectId();

    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ gig: fakeId.toString() });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  test('400 when gig is Paused', async () => {
    const freelancerId = new mongoose.Types.ObjectId();
    const clientId     = new mongoose.Types.ObjectId();
    const paused       = await createPausedGig(freelancerId);
    const token        = makeToken(clientId, 'client');

    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ gig: paused._id.toString() });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('GIG_UNAVAILABLE');
  });

  test('400 on invalid (non-ObjectId) gig value', async () => {
    const token = makeToken(new mongoose.Types.ObjectId(), 'client');

    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ gig: 'not-an-id' });

    expect(res.status).toBe(400);
  });

  test('booking stores the client and freelancer ids correctly', async () => {
    const freelancerId = new mongoose.Types.ObjectId();
    const clientId     = new mongoose.Types.ObjectId();
    const gig          = await createActiveGig(freelancerId);
    const token        = makeToken(clientId, 'client');

    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ gig: gig._id.toString() });

    expect(res.status).toBe(201);

    const booking = await Booking.findById(res.body.booking._id);
    expect(booking.client.toString()).toBe(clientId.toString());
    expect(booking.freelancer.toString()).toBe(freelancerId.toString());
  });
});

// ── GET /api/bookings/mine ────────────────────────────────────────────────────

describe('GET /api/bookings/mine', () => {
  test('200 and returns bookings for authenticated freelancer', async () => {
    const freelancerId = new mongoose.Types.ObjectId();
    const clientId     = new mongoose.Types.ObjectId();
    const gig          = await createActiveGig(freelancerId);

    // Create a booking as a client
    const clientToken = makeToken(clientId, 'client');
    await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ gig: gig._id.toString() });

    const freelancerToken = makeToken(freelancerId, 'freelancer');
    const res = await request(app)
      .get('/api/bookings/mine')
      .set('Authorization', `Bearer ${freelancerToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.bookings)).toBe(true);
    expect(res.body.bookings.length).toBeGreaterThan(0);
    expect(res.body.bookings[0].freelancer).toBe(freelancerId.toString());
  });

  test('200 returns empty array when freelancer has no bookings', async () => {
    const freelancerId    = new mongoose.Types.ObjectId();
    const freelancerToken = makeToken(freelancerId, 'freelancer');

    const res = await request(app)
      .get('/api/bookings/mine')
      .set('Authorization', `Bearer ${freelancerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.bookings).toEqual([]);
  });
});
