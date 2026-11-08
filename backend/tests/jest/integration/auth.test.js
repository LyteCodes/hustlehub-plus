'use strict';

process.env.JWT_SECRET = 'jest-auth-test-secret';
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

// POST /api/auth/register
describe('POST /api/auth/register', () => {
  const valid = {
    name:     'Jane Doe',
    email:    'jane@example.com',
    password: 'Valid#Pass1',
    role:     'client',
  };

  test('201 and returns user on valid payload', async () => {
    const res = await request(app).post('/api/auth/register').send(valid);
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('jane@example.com');
    expect(res.body.user.role).toBe('client');
    expect(res.body.user).not.toHaveProperty('password');
  });

  test('201 and returns user for freelancer role', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...valid, email: 'free@example.com', role: 'freelancer' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('freelancer');
  });

  test('409 when email already registered', async () => {
    await request(app).post('/api/auth/register').send(valid);
    const res = await request(app).post('/api/auth/register').send(valid);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_EMAIL');
  });

  test('400 when required fields are missing', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: valid.email });
    expect(res.status).toBe(400);
  });

  test('400 when unknown field is sent', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...valid, extra: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNKNOWN_FIELDS');
  });
});

// POST /api/auth/login 

describe('POST /api/auth/login', () => {
  const creds = { email: 'login@example.com', password: 'Valid#Pass1' };

  beforeEach(async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Login User', role: 'client', ...creds });
  });

  test('200 and returns token on valid credentials', async () => {
    const res = await request(app).post('/api/auth/login').send(creds);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user.email).toBe(creds.email);
  });

  test('401 when user does not exist', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'Valid#Pass1' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  test('401 when password is wrong', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: creds.email, password: 'WrongPass#9' });
    expect(res.status).toBe(401);
  });

  test('400 when request body fails validation', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'bad-email', password: creds.password });
    expect(res.status).toBe(400);
  });
});

// GET /api/auth/me 

describe('GET /api/auth/me', () => {
  test('token passes auth middleware (not 401) with a valid JWT', async () => {
    const id    = new mongoose.Types.ObjectId();
    const token = jwt.sign(
      { sub: id.toString(), role: 'client' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' },
    );

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).not.toBe(401);
  });

  test('401 when no token is provided', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('401 when token is malformed', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not.a.jwt');
    expect(res.status).toBe(401);
  });
});
