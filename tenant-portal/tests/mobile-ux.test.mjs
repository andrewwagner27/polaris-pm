// tests/mobile-ux.test.mjs
// Phone usability guarantees that a desktop test run can check statically. (Real iPhone Safari checks are listed in
// docs/launch/december-6-launch-plan.md: keyboard over the composer, camera upload, safe areas.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("viewport allows pinch-zoom (accessibility) and enables safe-area insets for the bottom nav", () => {
  const html = read("index.html");
  // interactive-widget=resizes-content: Android Chrome shrinks the layout (and dvh) for the keyboard, so the composer stays visible.
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1\.0, viewport-fit=cover, interactive-widget=resizes-content" \/>/);
  assert.ok(!/user-scalable=no|maximum-scale=1/.test(html));
  assert.match(read("src/TenantLayout.jsx"), /paddingBottom:"env\(safe-area-inset-bottom\)"/);
});

test("form fields are 16px on phones (no iOS focus zoom) and full-screen views use dvh", () => {
  const css = read("src/index.css");
  assert.match(css, /@media \(max-width: 767px\) \{\s*input, textarea, select \{ font-size: 16px !important; \}/);
  assert.match(css, /\.m-fit \{ height: 100vh; height: 100dvh; min-height: 0 !important; overflow: hidden; \}/);
});

test("phones: the chat fits between the top bar and the bottom nav, so the composer is visible without scrolling", () => {
  // The shell is 100dvh and the bottom nav is part of its column on Messages (no fixed bar over the composer, no
  // hard-coded header/nav heights to subtract twice). Measured in the browser at 375/390/768/1024/1440.
  const layout = read("src/TenantLayout.jsx");
  assert.match(layout, /className=\{`t-light t-shell\$\{fit \? " m-fit" : ""\}`\}/);
  assert.match(layout, /position: fit \? "relative" : "fixed"/);
  assert.match(read("src/index.css"), /\.m-chat \{ display: flex; flex-direction: column; flex: 1; min-height: 0;/);
});

test("Wallet offers bank linking only when online rent payment is available (pilot: never)", () => {
  const src = read("src/Wallet.jsx");
  assert.match(src, /const \[onlinePay,\s+setOnlinePay\]\s+= useState\(false\);/, "default: not offered");
  assert.match(src, /setOnlinePay\(!dueErr && !!due\?\.ledger_active && due\?\.online_available !== false\);/);
  assert.match(src, /\{!onlinePay \? null : !stripePromise \? \(/);
});

test("chat composer: labelled, send key, stays in view above the keyboard, 44px send button", () => {
  const src = read("src/MessagingScreen.jsx");
  assert.match(src, /className="m-chat"/);
  assert.match(src, /aria-label="Message to Modus Property Management"/);
  assert.match(src, /enterKeyHint="send"/);
  // No scrollIntoView (it scrolled the whole page); the browser keeps the focused field visible, and the history
  // container is the only thing the app scrolls.
  assert.doesNotMatch(src, /scrollIntoView/);
  assert.match(src, /aria-label="Send message"\s+style=\{\{ width:44, height:44,/);
});
