// Marketing accuracy (src/LandingPage.jsx): features that are not live in production are never presented as
// available, product visuals are labelled as sample data, and the page carries no invented metrics, customer
// claims or testimonials.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/LandingPage.jsx", import.meta.url), "utf8");
// Visible copy only (drop the CSS block and comments).
const copy = src.slice(0, src.indexOf("const CSS = `")).replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "");

test("unreleased capabilities are not advertised and rent payment availability is qualified", () => {
  for (const re of [/autopay/i, /rent collection/i, /collect rent/i, /report export/i, /DSCR/, /Insurance tracking/i]) {
    assert.doesNotMatch(copy, re, String(re));
  }
  const descriptivePages = copy.slice(copy.indexOf("function AboutModus"), copy.indexOf("function ContactModus"));
  const homepage = copy.replace(descriptivePages, "");
  assert.doesNotMatch(homepage, /pay rent online|online rent|\bACH\b|\bStripe\b/i);
  assert.match(descriptivePages, /pay rent where online payments are enabled/);
  assert.match(descriptivePages, /Where online payments are enabled, residents can pay rent through the portal by ACH bank transfer, processed by Stripe/);
});

test("no invented metrics, customer claims or testimonials", () => {
  for (const re of [/Units managed/, /Monthly SaaS fees/, /Join landlords/, /testimonial/i, /trusted by/i, /\b\d+\+? (landlords|customers|units|properties)\b/i, /\d+% (faster|less|more)/i, /★|rating/i]) {
    assert.doesNotMatch(copy, re, String(re));
  }
});

test("product visuals are decorative mockups labelled as sample data", () => {
  for (const name of ["DashboardMock", "DecisionMock", "PhoneMock"]) {
    const body = src.slice(src.indexOf(`function ${name}(`), src.indexOf("\n}\n", src.indexOf(`function ${name}(`)));
    assert.match(body, /aria-hidden="true"/, `${name} is hidden from assistive tech`);
  }
  assert.equal((src.match(/<figcaption>[^<]*sample[^<]*<\/figcaption>/gi) || []).length, 3);
  assert.doesNotMatch(src, /<img /, "no stock imagery");
});

test("the required headlines and calls to action are present and routed", () => {
  for (const s of ["Property management, without the busywork.", "Know what needs your attention. Instantly.",
    "A better experience for the people who call your properties home.", "Less administration. More ownership.",
    "Stay organized", "Respond faster", "Stay in control"]) assert.ok(src.includes(s), s);
  assert.equal((src.match(/href="#maintenance-tour" className="lp-btn lp-btn-gold">See how maintenance works/g) || []).length, 2);
  assert.match(src, /href="\/login" onClick=\{go\("\/login"\)\} className="lp-btn lp-btn-quiet">Tenant portal</);
  assert.match(src, /id="maintenance-tour"[^>]+aria-labelledby="maintenance-tour-title"/);
});

test("mobile header: accessible menu button holds both logins; desktop links hide on phones", () => {
  assert.match(src, /className="lp-burger" aria-label="Menu" aria-expanded=\{menuOpen\} aria-controls="lp-menu"/);
  assert.match(src, /<div id="lp-menu"[^>]*>\s*<a href="\/landlord\/login"[^>]*>Landlord login<\/a>\s*<a href="\/login"[^>]*>Tenant login<\/a>/);
  assert.match(src, /if \(e\.key === "Escape"\) \{ setMenuOpen\(false\); menuBtn\.current\?\.focus\(\); \}/);
  assert.match(src, /@media \(max-width: 720px\) \{ \.lp-nav-desktop \{ display: none; \} \.lp-burger \{ display: flex; \} \}/);
  assert.match(src, /\.lp-burger \{ display: none; width: 44px; height: 44px;/);
});

test("layout collapses on phones and respects reduced motion", () => {
  assert.match(src, /\.lp-hero h1 \{ font-size: clamp\(34px, 6vw, 60px\);/);
  assert.match(src, /\.lp-cta \.lp-btn \{ flex: 1 1 100%; \}/);
  assert.match(src, /\.lp-split, \.lp-split-rev \{ grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(src, /@media \(prefers-reduced-motion: reduce\)/);
});
