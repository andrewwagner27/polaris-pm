import { test } from "node:test";
import assert from "node:assert/strict";
import handler from "../api/contact.js";

const submission = { name: "Test Resident", email: "visitor@example.test", message: "How does Modus work?" };

function setEnv(t, name, value) {
  const previous = process.env[name];
  process.env[name] = value;
  t.after(() => {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  });
}

async function request(body = submission, options = {}) {
  const result = { headers: {} };
  const res = {
    setHeader(name, value) { result.headers[name] = value; },
    status(code) { result.code = code; return this; },
    json(value) { result.body = value; },
  };
  await handler({
    method: "POST", body,
    headers: { "content-type": "application/json", "x-vercel-forwarded-for": "192.0.2.10" },
    ...options,
  }, res);
  return result;
}

test("Preview validates submissions and never calls the mail provider", async (t) => {
  setEnv(t, "VERCEL_ENV", "preview");
  const send = t.mock.method(globalThis, "fetch", () => { throw new Error("Preview must not send"); });
  assert.equal((await request(submission, { method: "GET" })).code, 405);
  assert.equal((await request({ ...submission, email: "invalid" })).code, 400);
  assert.equal((await request({ ...submission, website: "bot" })).code, 400);
  assert.deepEqual((await request()).body, { status: "preview" });
  assert.equal(send.mock.callCount(), 0);
});

test("production uses the configured recipient, escapes the message, and limits repeat submissions", async (t) => {
  setEnv(t, "VERCEL_ENV", "production");
  setEnv(t, "CONTACT_EMAIL", "staff@example.test");
  setEnv(t, "RESEND_API_KEY", "fixture-only");
  const send = t.mock.method(globalThis, "fetch", async () => Response.json({ id: "mock-message" }));
  const body = { ...submission, to: "ignored@example.test", message: "<p>Test message</p>" };
  for (let i = 0; i < 4; i++) assert.deepEqual((await request(body)).body, { status: "sent" });
  const result = await request(body);
  assert.equal(result.code, 429);
  assert.equal(result.headers["Retry-After"], "600");
  assert.equal(send.mock.callCount(), 4);
  const [, options] = send.mock.calls[0].arguments;
  const mail = JSON.parse(options.body);
  assert.deepEqual(mail.to, ["staff@example.test"]);
  assert.deepEqual(mail.reply_to, [submission.email]);
  assert.match(mail.html, /&lt;p&gt;Test message&lt;\/p&gt;/);
  assert.equal(options.headers["Idempotency-Key"], send.mock.calls[1].arguments[1].headers["Idempotency-Key"]);
});
