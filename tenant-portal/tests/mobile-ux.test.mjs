// tests/mobile-ux.test.mjs
// Phone usability guarantees that a desktop test run can check statically. (Real iPhone Safari checks are listed in
// docs/launch/december-6-launch-plan.md: keyboard over the composer, camera upload, safe areas.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("viewport allows pinch-zoom (accessibility) and enables safe-area insets for the bottom nav", () => {
  const html = read("index.html");
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1\.0, viewport-fit=cover" \/>/);
  assert.ok(!/user-scalable=no|maximum-scale=1/.test(html));
  assert.match(read("src/TenantLayout.jsx"), /paddingBottom:"env\(safe-area-inset-bottom\)"/);
});

test("form fields are 16px on phones (no iOS focus zoom) and full-screen views use dvh", () => {
  const css = read("src/index.css");
  assert.match(css, /@media \(max-width: 767px\) \{\s*input, textarea, select \{ font-size: 16px !important; \}/);
  assert.match(css, /\.full-height \{ height: 100vh; height: 100dvh; \}/);
});

test("chat composer: labelled, send key, stays in view above the keyboard, 44px send button", () => {
  const src = read("src/MessagingScreen.jsx");
  assert.match(src, /className="full-height"/);
  assert.match(src, /aria-label="Message to Modus Property Management"/);
  assert.match(src, /enterKeyHint="send"/);
  assert.match(src, /scrollIntoView\?\.\(\{ block: "end"/);
  assert.match(src, /aria-label="Send message"\s+style=\{\{ width:44, height:44,/);
});
