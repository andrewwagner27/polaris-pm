// Marketing accuracy (src/LandingPage.jsx): features that are not live in production are never presented as
// available, and the page carries no invented operating metrics, customer claims or testimonials.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/LandingPage.jsx", import.meta.url), "utf8");
const feats = readFileSync(new URL("../src/lib/landingFeatures.js", import.meta.url), "utf8");
const block = (name) => feats.slice(feats.indexOf(`export const ${name} = [`), feats.indexOf("];", feats.indexOf(`export const ${name} = [`)));
const statusOf = (list, re) => {
  const line = list.split("\n").find((l) => re.test(l));
  return line && /status: "([^"]+)"/.exec(line)?.[1];
};

test("rent collection, autopay, downloadable reports and the unrouted pages are not advertised as available", () => {
  const L = block("FEATURES_LANDLORD"), T = block("FEATURES_TENANT");
  for (const [list, re] of [[L, /rent collection/i], [L, /report export/i], [L, /DSCR/], [T, /Pay rent online/], [T, /Autopay/], [T, /ledger/i]]) {
    const st = statusOf(list, re);
    assert.ok(st, `${re} listed`);
    assert.notEqual(st, "Available", `${re} must not be "Available"`);
  }
  assert.doesNotMatch(src + feats, /Insurance tracking/, "no route exists for insurance tracking");
});

test("every listed feature carries an explicit status", () => {
  for (const name of ["FEATURES_LANDLORD", "FEATURES_TENANT"]) {
    const rows = block(name).split("\n").filter((l) => /title:/.test(l));
    assert.ok(rows.length > 0);
    for (const r of rows) assert.match(r, /status: "(Available|Coming soon|Planned)"/, r);
  }
});

test("no invented metrics, customer claims or testimonials", () => {
  for (const re of [/Units managed/, /Monthly SaaS fees/, /Yours to own/, /Join landlords/, /testimonial/i, /trusted by/i, /\b\d+\+? (landlords|customers|units)\b/i, /autopay — no checks/i, /Collect rent automatically/]) {
    assert.doesNotMatch(src + feats, re, String(re));
  }
});

test("mobile layout: columns collapse, hero type scales, CTAs stay full width on small phones", () => {
  assert.match(src, /grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 380px\), 1fr\)\)/);
  assert.match(src, /grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 240px\), 1fr\)\)/);
  assert.match(src, /fontSize: "clamp\(36px, 8vw, 64px\)"/);
  assert.match(src, /\.lp-cta \.m-btn \{ width:100%; \}/);
  assert.doesNotMatch(src, /gridTemplateColumns: "1fr 1fr"|repeat\(3,1fr\)/);
});
