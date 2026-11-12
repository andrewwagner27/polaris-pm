// tests/helpers/fakeResend.mjs
// An in-memory Resend that follows the documented idempotency rules
// (https://resend.com/docs/dashboard/emails/idempotency-keys):
//   - a key is remembered for 24 h with the payload it was first used with;
//   - same key + same payload → the ORIGINAL response, nothing sent again;
//   - same key + different payload → 409 invalid_idempotent_request;
//   - same key while the first request is still running → 409 concurrent_idempotent_requests.
// Resend does not document whether a FAILED request keeps its key; `storeFailures` lets tests cover both.
//
// Each call consumes the next scripted behaviour (default "ok"):
//   "ok"              accept and send
//   "500" | "429"     provider error (nothing sent)
//   "422"             validation error (nothing sent)
//   "net-before"      connection fails before Resend receives it (nothing sent, key not stored)
//   "timeout-after"   Resend accepts and sends, but the response is lost (client sees a timeout)
//   { slowMs: n }     accept, stay "in progress" for n ms, then send and respond
//
// `sent` is what recipients actually received; `calls` is every HTTP request made.

import crypto from "node:crypto";

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class FakeResend {
  constructor({ storeFailures = false } = {}) {
    this.storeFailures = storeFailures;
    this.keys = new Map();     // key -> { hash, inFlight, response: { status, body } }
    this.sent = [];
    this.calls = [];
    this.script = [];
    this.seq = 0;
  }
  plan(...behaviours) { this.script.push(...behaviours); return this; }

  async handle(url, init = {}) {
    const headers = init.headers || {};
    const key = headers["Idempotency-Key"];
    const body = JSON.parse(init.body);
    const hash = crypto.createHash("sha256").update(init.body).digest("hex");
    this.calls.push({ key, body, headers });

    // A connection failure happens before Resend sees the request, so before any key lookup.
    if (this.script[0] === "net-before") { this.script.shift(); throw new TypeError("fetch failed"); }

    if (key && this.keys.has(key)) {
      const entry = this.keys.get(key);
      if (entry.hash !== hash) return json({ statusCode: 409, name: "invalid_idempotent_request", message: "Same idempotency key used with a different request payload." }, 409);
      if (entry.inFlight) return json({ statusCode: 409, name: "concurrent_idempotent_requests", message: "Same idempotency key used while original request is still in progress." }, 409);
      return json(entry.response.body, entry.response.status);
    }

    const b = this.script.length ? this.script.shift() : "ok";
    const accept = () => {
      const id = `re_${++this.seq}`;
      this.sent.push({ id, ...body, key });
      if (key) this.keys.set(key, { hash, inFlight: false, response: { status: 200, body: { id } } });
      return { id };
    };
    const fail = (status, name, message) => {
      if (key && this.storeFailures) this.keys.set(key, { hash, inFlight: false, response: { status, body: { statusCode: status, name, message } } });
      return json({ statusCode: status, name, message }, status);
    };

    if (b === "ok") return json(accept());
    if (b === "500") return fail(500, "internal_server_error", "provider error");
    if (b === "429") return fail(429, "rate_limit_exceeded", "Too many requests");
    if (b === "422") return fail(422, "validation_error", "Invalid `from` field");
    if (b === "net-before") throw new TypeError("fetch failed");
    if (b === "timeout-after") { accept(); const e = new Error("The operation was aborted"); e.name = "AbortError"; throw e; }
    if (b && typeof b === "object" && b.slowMs) {
      if (key) this.keys.set(key, { hash, inFlight: true, response: null });
      await sleep(b.slowMs);
      const id = `re_${++this.seq}`;
      this.sent.push({ id, ...body, key });
      if (key) this.keys.set(key, { hash, inFlight: false, response: { status: 200, body: { id } } });
      return json({ id });
    }
    throw new Error(`unknown fake behaviour ${JSON.stringify(b)}`);
  }
}
