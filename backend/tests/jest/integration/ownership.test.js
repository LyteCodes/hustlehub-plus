'use strict';

process.env.JWT_SECRET = 'jest-ownership-test-secret-0123456789abcdef';
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

const SECRET = 'jest-ownership-test-secret-0123456789abcdef';

function makeToken(id, role) {
  return jwt.sign({ sub: id.toString(), role }, SECRET, { expiresIn: '1h' });
}

let app;
let Gig;

beforeAll(async () => {
  const os = require('os');
  await mongoose.connect(process.env.MONGO_MEM_URI, { runtimeAdapters: { os } });
  app = require('../../../src/app');
  Gig = require('../../../src/models/gig');
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
async function createGig(freelancerId) {
  return Gig.create({
    freelancer:   freelancerId,
    title:        'Test Gig',
    category:     'Development',
    description:  'A test gig for unit testing.',
    rate:         500,
    durationHours: 2,
    status:       'Active',
  });
}

// ownership middleware
describe('gig ownership middleware', () => {
  test('owner can GET their own gig', async () => {
    const ownerId = new mongoose.Types.ObjectId();
    const gig     = await createGig(ownerId);
    const token   = makeToken(ownerId, 'freelancer');

    const res = await request(app)
      .get(`/api/gigs/${gig._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  test('another freelancer gets 404 for a gig they do not own', async () => {
    const ownerA  = new mongoose.Types.ObjectId();
    const ownerB  = new mongoose.Types.ObjectId();
    const gig     = await createGig(ownerA);
    const tokenB  = makeToken(ownerB, 'freelancer');

    const res = await request(app)
      .get(`/api/gigs/${gig._id}`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
  });

  test('admin can GET any gig regardless of ownership', async () => {
    const ownerId = new mongoose.Types.ObjectId();
    const adminId = new mongoose.Types.ObjectId();
    const gig     = await createGig(ownerId);
    const token   = makeToken(adminId, 'admin');

    const res = await request(app)
      .get(`/api/gigs/${gig._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  test('returns 404 when gig id does not exist in DB', async () => {
    const userId  = new mongoose.Types.ObjectId();
    const token   = makeToken(userId, 'freelancer');
    const fakeId  = new mongoose.Types.ObjectId();

    const res = await request(app)
      .get(`/api/gigs/${fakeId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});
