/**
 * @file security.test.js
 * @description Integration tests for the KAN-07 and KAN-08 security controls:
 * missing, forged, unsigned (alg:none) and expired tokens all get the same
 * generic 401; the wrong role gets 403; operator injection in the login body
 * is rejected with 400. Uses the node:test runner and fetch against an
 * in-process Express server, like auth.test.js.
 *
 * https://nodejs.org/api/test.html
 * https://nodejs.org/api/assert.html
 * https://www.npmjs.com/package/jsonwebtoken
 * https://www.rfc-editor.org/rfc/rfc8725 (JWT best practices: reject alg "none", pin the algorithm)
 * https://owasp.org/www-community/attacks/NoSQL_Injection
 */
// AI Disclosure: test cases drafted with Claude (Anthropic) from the KAN-07/KAN-08 acceptance criteria, then reviewed and adapted.

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const app = require("../../src/app");
const config = require("../../src/config");

describe("Security controls (KAN-07, KAN-08)", () => {
  let server;
  let baseUrl;
  const newId = () => new mongoose.Types.ObjectId().toString();
  const tokenFor = (role, payload = {}) =>
    jwt.sign({ sub: newId(), role, ...payload }, config.jwt.secret, {
      algorithm: "HS256",
    });
  const bearer = (token) => ({ Authorization: `Bearer ${token}` });
  const UNAUTHORIZED = {
    error: { code: "UNAUTHORIZED", message: "Authentication required." },
  };

  async function request(path, { method = "GET", body, headers = {} } = {}) {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  }

  before(async () => {
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  });

  it("rejects a missing token with the generic 401", async () => {
    const res = await request("/api/auth/me");
    assert.equal(res.status, 401);
    assert.deepEqual(res.body, UNAUTHORIZED);
  });

  it("rejects a token signed with another key", async () => {
    const forged = jwt.sign({ sub: newId(), role: "admin" }, "x".repeat(64), {
      algorithm: "HS256",
    });
    const res = await request("/api/admin/stats", { headers: bearer(forged) });
    assert.equal(res.status, 401);
    assert.deepEqual(res.body, UNAUTHORIZED);
  });

  it("rejects an unsigned alg:none token", async () => {
    const part = (obj) =>
      Buffer.from(JSON.stringify(obj)).toString("base64url");
    const unsigned = `${part({ alg: "none", typ: "JWT" })}.${part({ sub: newId(), role: "admin" })}.`;
    const res = await request("/api/admin/stats", {
      headers: bearer(unsigned),
    });
    assert.equal(res.status, 401);
    assert.deepEqual(res.body, UNAUTHORIZED);
  });

  it("rejects an expired token with the same body", async () => {
    const expired = tokenFor("admin", {
      exp: Math.floor(Date.now() / 1000) - 60,
    });
    const res = await request("/api/admin/stats", { headers: bearer(expired) });
    assert.equal(res.status, 401);
    assert.deepEqual(res.body, UNAUTHORIZED);
  });

  it("returns 403 for the wrong role", async () => {
    const res = await request("/api/admin/stats", {
      headers: bearer(tokenFor("client")),
    });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, "FORBIDDEN");
  });

  it("rejects operator injection in the login body", async () => {
    const res = await request("/api/auth/login", {
      method: "POST",
      body: { email: { $ne: null }, password: { $ne: null } },
    });
    assert.equal(res.status, 400);
  });

  it("rejects a malformed id with 400, not 500", async () => {
    const res = await request("/api/gigs/not-an-id", {
      headers: bearer(tokenFor("freelancer")),
    });
    assert.equal(res.status, 400);
  });

  it("stores an XSS payload as plain text and serves it as JSON", async () => {
    const email = `xss_${Date.now()}@hustlehub.co.za`;
    // Random password, so the breached-password check (KAN-103.1) can't reject it
    const password = `Xss-${crypto.randomUUID()}-Aa1!`;
    await request("/api/auth/register", {
      method: "POST",
      body: { name: "XSS Test", email, password, role: "freelancer" },
    });
    const login = await request("/api/auth/login", { method: "POST", body: { email, password } });
    const payload = '<img src=x onerror="alert(1)"><script>alert(2)</script>';

    const res = await fetch(`${baseUrl}/api/gigs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...bearer(login.body.token) },
      body: JSON.stringify({ title: "XSS check", category: "Writing", description: payload, rate: 100, durationHours: 1 }),
    });
    const body = await res.json();

    assert.equal(res.status, 201);
    assert.equal(body.gig.description, payload); // stored unchanged; escaping happens when it's rendered
    assert.match(res.headers.get("content-type"), /application\/json/);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff"); // browsers won't treat it as HTML
  });
});