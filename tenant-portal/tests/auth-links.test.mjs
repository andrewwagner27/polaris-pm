// tests/auth-links.test.mjs
// Expired / used / invalid Modus email links (invitation, password reset) must fail safely with a clear next step,
// wherever Supabase sends them (onboarding page, reset page, or the home page fallback).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const L = await import("../src/lib/onboardingLink.js");
const read = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");
const EXPIRED = "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb=";

describe("authLinkError / resetLinkState", () => {
  test("expired, invalid and clean links are told apart (fragment or query)", () => {
    assert.equal(L.authLinkError({ hash: EXPIRED }), "expired");
    assert.equal(L.authLinkError({ search: "?error=access_denied&error_description=Link+has+expired" }), "expired");
    assert.equal(L.authLinkError({ search: "?error=unauthorized_client&error_code=bad_jwt" }), "invalid");
    assert.equal(L.authLinkError({ hash: "#access_token=abc&type=recovery" }), null);
    assert.equal(L.authLinkError({}), null);
  });
  test("reset page: a link error wins even if some account is signed in; no session → missing", () => {
    assert.equal(L.resetLinkState({ hash: EXPIRED, hasSession: true }), "expired");
    assert.equal(L.resetLinkState({ search: "?error=server_error", hasSession: true }), "invalid");
    assert.equal(L.resetLinkState({ hasSession: false }), "missing");
    assert.equal(L.resetLinkState({ hasSession: true }), "ready");
  });
  test("every state has a message with a recovery action", () => {
    for (const k of ["expired", "invalid", "missing"]) assert.ok(L.AUTH_LINK_MESSAGES[k].title && L.AUTH_LINK_MESSAGES[k].body);
    assert.match(L.AUTH_LINK_MESSAGES.expired.body, /request a new reset link/i);
    assert.match(L.AUTH_LINK_MESSAGES.expired.body, /ask Modus management to send a new one/i);
  });
});

describe("expired link reaching the home page (Supabase fallback)", () => {
  test("is redirected to the link-error page; pages that handle their own errors are left alone", () => {
    assert.equal(L.linkErrorRedirect({ pathname: "/", hash: EXPIRED }), "/link-error?reason=expired");
    assert.equal(L.linkErrorRedirect({ pathname: "/home", search: "?error=x" }), "/link-error?reason=invalid");
    for (const p of ["/onboarding", "/reset-password", "/link-error"]) assert.equal(L.linkErrorRedirect({ pathname: p, hash: EXPIRED }), null);
    assert.equal(L.linkErrorRedirect({ pathname: "/", hash: "" }), null);
  });
  test("App mounts the catcher inside the router and routes /link-error", () => {
    const app = read("App.jsx");
    assert.match(app, /<Router>\s*<LinkErrorCatcher\/>/);
    assert.match(app, /path="\/link-error"\s+element=\{<AuthLinkError\/>\}/);
    const page = read("AuthLinkError.jsx");
    assert.match(page, /navigate\("\/forgot-password"\)/);
    assert.match(page, /navigate\("\/login"\)/);
    assert.match(page, /role="alert"/);
  });
});

describe("password reset page", () => {
  const src = read("ResetPassword.jsx");
  test("shows the expired/invalid/missing state instead of the form, with 'Send a new reset link'", () => {
    assert.match(src, /resetLinkState\(\{ hash, search, hasSession: Boolean\(session\) \}\)/);
    assert.match(src, /if \(linkState !== "ready"\) \{/);
    assert.match(src, /Send a new reset link/);
  });
  test("names the account whose password is being changed, and never shows raw auth errors", () => {
    assert.match(src, /Account: <span/);
    assert.ok(!/setError\(error\.message\)/.test(src));
    assert.match(src, /Your reset session has expired/);
  });
  test("the password input is defined outside the page component (no remount/focus loss per keystroke) and is 16px", () => {
    const fnPage = src.indexOf("export default function ResetPassword");
    const fnInput = src.indexOf("function InputField(");
    assert.ok(fnInput > 0 && fnInput < fnPage);
    assert.match(src, /autoComplete="new-password"/);
    assert.match(src.slice(fnInput, fnPage), /fontSize: 16/);
  });
});
