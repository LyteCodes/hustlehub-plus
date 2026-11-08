'use strict';

const express = require('express');
const request = require('supertest');

const {
  registerValidation,
  loginValidation,
  bookingValidation,
} = require('../../../src/middleware/validation.middleware');

// helpers

function makeApp(middleware) {
  const app = express();
  app.use(express.json());
  app.post('/test', middleware, (req, res) => res.status(200).json({ ok: true }));
  return app;
}

const VALID_PASSWORD = 'Valid#Pass1';

// registerValidation

describe('registerValidation', () => {
  const app = makeApp(registerValidation);

  const valid = {
    name:     'Test User',
    email:    'test@example.com',
    password: VALID_PASSWORD,
    role:     'client',
  };

  test('accepts a valid registration payload', async () => {
    const res = await request(app).post('/test').send(valid);
    expect(res.status).toBe(200);
  });

  test('rejects missing name', async () => {
    const { name: _, ...body } = valid;
    const res = await request(app).post('/test').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('rejects invalid email format', async () => {
    const res = await request(app).post('/test').send({ ...valid, email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('rejects missing password', async () => {
    const { password: _, ...body } = valid;
    const res = await request(app).post('/test').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('rejects weak password (no uppercase)', async () => {
    const res = await request(app).post('/test').send({ ...valid, password: 'weak#pass1' });
    expect(res.status).toBe(400);
  });

  test('rejects an unknown field', async () => {
    const res = await request(app).post('/test').send({ ...valid, hacker: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNKNOWN_FIELDS');
  });

  test('role defaults to client when omitted', async () => {
    const { role: _, ...body } = valid;
    const res = await request(app).post('/test').send(body);
    expect(res.status).toBe(200);
  });

  test('rejects invalid role value', async () => {
    const res = await request(app).post('/test').send({ ...valid, role: 'superadmin' });
    expect(res.status).toBe(400);
  });

  test('accepts role=freelancer', async () => {
    const res = await request(app).post('/test').send({ ...valid, role: 'freelancer' });
    expect(res.status).toBe(200);
  });
});

// loginValidation 
describe('loginValidation', () => {
  const app = makeApp(loginValidation);

  const valid = { email: 'user@example.com', password: 'anyPassword123' };

  test('accepts a valid login payload', async () => {
    const res = await request(app).post('/test').send(valid);
    expect(res.status).toBe(200);
  });

  test('rejects missing email', async () => {
    const res = await request(app).post('/test').send({ password: valid.password });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('rejects malformed email', async () => {
    const res = await request(app).post('/test').send({ ...valid, email: 'bad@@x' });
    expect(res.status).toBe(400);
  });

  test('rejects missing password', async () => {
    const res = await request(app).post('/test').send({ email: valid.email });
    expect(res.status).toBe(400);
  });

  test('rejects password longer than 128 chars', async () => {
    const res = await request(app).post('/test').send({ ...valid, password: 'a'.repeat(129) });
    expect(res.status).toBe(400);
  });

  test('rejects an unknown field', async () => {
    const res = await request(app).post('/test').send({ ...valid, extra: true });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNKNOWN_FIELDS');
  });
});

// bookingValidation
describe('bookingValidation', () => {
  const app = makeApp(bookingValidation);

  const validId = '64f1a2b3c4d5e6f7a8b9c0d1'; // 24-hex MongoDB ObjectId

  test('accepts valid gig ObjectId without notes', async () => {
    const res = await request(app).post('/test').send({ gig: validId });
    expect(res.status).toBe(200);
  });

  test('accepts valid gig ObjectId with notes', async () => {
    const res = await request(app).post('/test').send({ gig: validId, notes: 'Please hurry.' });
    expect(res.status).toBe(200);
  });

  test('rejects missing gig field', async () => {
    const res = await request(app).post('/test').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('rejects non-ObjectId gig value', async () => {
    const res = await request(app).post('/test').send({ gig: 'not-an-id' });
    expect(res.status).toBe(400);
  });

  test('rejects notes exceeding 500 characters', async () => {
    const res = await request(app)
      .post('/test')
      .send({ gig: validId, notes: 'x'.repeat(501) });
    expect(res.status).toBe(400);
  });

  test('accepts notes at exactly 500 characters', async () => {
    const res = await request(app)
      .post('/test')
      .send({ gig: validId, notes: 'x'.repeat(500) });
    expect(res.status).toBe(200);
  });

  test('rejects an unknown field', async () => {
    const res = await request(app).post('/test').send({ gig: validId, surprise: true });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNKNOWN_FIELDS');
  });
});
