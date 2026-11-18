// Messages layout stability: only the message-history container scrolls, inside a viewport-fitted shell.
// See src/lib/messageScroll.js and the .m-fit / .m-chat rules in src/index.css.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decideScroll, isNearBottom, scrollToLatest, PIN_THRESHOLD } from "../src/lib/messageScroll.js";

const read = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");

test("opening a thread jumps to its latest message; an empty thread does nothing", () => {
  assert.equal(decideScroll({ threadChanged: true, prevCount: 0, count: 12, pinned: false, ownSend: false }), "jump");
  assert.equal(decideScroll({ threadChanged: true, prevCount: 5, count: 0, pinned: true, ownSend: false }), "none");
});

test("new messages follow a reader at the bottom, and always follow the reader's own send", () => {
  assert.equal(decideScroll({ threadChanged: false, prevCount: 4, count: 5, pinned: true, ownSend: false }), "follow");
  assert.equal(decideScroll({ threadChanged: false, prevCount: 4, count: 5, pinned: false, ownSend: true }), "follow");
});

test("a reader looking at older messages keeps their place and gets an indicator", () => {
  assert.equal(decideScroll({ threadChanged: false, prevCount: 4, count: 5, pinned: false, ownSend: false }), "indicate");
});

test("polls and re-renders with no new message never scroll", () => {
  assert.equal(decideScroll({ threadChanged: false, prevCount: 5, count: 5, pinned: true, ownSend: false }), "none");
  assert.equal(decideScroll({ threadChanged: false, prevCount: 6, count: 5, pinned: true, ownSend: true }), "none");
});

test("near-bottom detection and scrolling touch only the given container", () => {
  const el = { scrollHeight: 1000, clientHeight: 400, scrollTop: 600 - PIN_THRESHOLD };
  assert.equal(isNearBottom(el), true);
  el.scrollTop = 100;
  assert.equal(isNearBottom(el), false);
  scrollToLatest(el);
  assert.equal(el.scrollTop, 1000);
});

test("messaging screens never use scrollIntoView or their own 100vh/100dvh height", () => {
  for (const f of ["MessagingScreen.jsx", "LandlordMessages.jsx"]) {
    const s = read(f);
    assert.doesNotMatch(s, /scrollIntoView/, f);
    assert.doesNotMatch(s, /100d?vh/, f);
    assert.match(s, /useMessageScroll\(/, f);
    assert.match(s, /ref=\{historyRef\} onScroll=\{onHistoryScroll\} className="m-chat-history"/, f);
  }
});

test("the shells fit the viewport on Messages and let the chat take only the remaining height", () => {
  const css = read("index.css");
  assert.match(css, /\.m-fit \{ height: 100vh; height: 100dvh; min-height: 0 !important; overflow: hidden; \}/);
  assert.match(css, /\.m-chat-history \{[^}]*flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain;/);
  assert.match(css, /\.m-fit \.m-fit-col \{[^}]*min-height: 0;/);
  assert.match(read("LandlordLayout.jsx"), /const fit = location\.pathname\.startsWith\("\/landlord\/messages"\)/);
  assert.match(read("LandlordLayout.jsx"), /\.m-fit \.l-bottom\{position:relative;/);   // one bar, in the column
  assert.match(read("TenantLayout.jsx"), /const fit\s+= pathname\.startsWith\("\/messages"\)/);
  assert.match(read("TenantLayout.jsx"), /position: fit \? "relative" : "fixed"/);
});

test("body and #root clip sideways overflow without becoming nested scroll containers", () => {
  const css = read("index.css");
  assert.match(css, /body, #root \{ overflow-x: clip; \}/);
  assert.doesNotMatch(css, /html, body, #root \{[^}]*overflow-x: hidden/);
});

test("scrollbars follow the portal: subtle on dark, understated on light, for Firefox and WebKit", () => {
  const css = read("index.css");
  assert.match(css, /\* \{ scrollbar-width: thin; scrollbar-color: var\(--m-sb-thumb\) var\(--m-sb-track\); \}/);
  assert.match(css, /::-webkit-scrollbar-thumb \{ background: var\(--m-sb-thumb\)/);
  assert.match(css, /html:has\(\.l-shell\) \{ color-scheme: dark; \}/);
  assert.match(css, /\.t-light \{[^}]*--m-sb-thumb: #CFC8BB/);
});

test("both login screens associate their labels with the fields", () => {
  for (const [f, p] of [["LoginScreen.jsx", "tenant-login"], ["LandlordLogin.jsx", "landlord-login"]]) {
    const s = read(f);
    for (const k of ["email", "password"]) {
      assert.match(s, new RegExp(`htmlFor="${p}-${k}"`), `${f} label ${k}`);
      assert.match(s, new RegExp(`<Input id="${p}-${k}"`), `${f} input ${k}`);
    }
    assert.match(s, /aria-label=\{showPw \? "Hide password" : "Show password"\}/);
  }
});
