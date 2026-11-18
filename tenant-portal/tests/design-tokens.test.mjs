// Design tokens: every text colour meets WCAG AA (4.5:1) on every surface it is used on, and retired failing colours
// do not come back. See src/lib/tokens.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DARK, LIGHT, contrast } from "../src/lib/tokens.js";

const AA = 4.5;

test("dark: every text token is AA on page, card and raised surfaces", () => {
  for (const fg of ["text", "textSub", "textMuted", "gold", "action", "blue", "green", "red", "amber"]) {
    for (const bg of ["bg", "surface", "raised"]) {
      const r = contrast(DARK[fg], DARK[bg]);
      assert.ok(r >= AA, `${fg} ${DARK[fg]} on ${bg} ${DARK[bg]} = ${r.toFixed(2)}`);
    }
  }
});

test("dark: Action Gold is AA on both dark backgrounds; filled gold buttons use dark text", () => {
  assert.equal(DARK.action, "#C9A968");
  assert.ok(contrast(DARK.action, "#0B0D10") >= AA);
  assert.ok(contrast(DARK.action, "#15191F") >= AA);
  assert.ok(contrast(DARK.onGold, DARK.action) >= AA);
  // Status-coloured filled buttons keep dark text too.
  for (const c of ["green", "red", "blue", "amber"]) assert.ok(contrast(DARK.onGold, DARK[c]) >= AA, c);
});

test("light: tenant portal text and interactive gold are AA; white on filled gold is AA", () => {
  for (const fg of ["text", "textSub", "textMuted", "gold", "blue", "green", "red", "amber"]) {
    for (const bg of ["bg", "surface", "raised", "goldBg"]) {
      const r = contrast(LIGHT[fg], LIGHT[bg]);
      assert.ok(r >= AA, `${fg} ${LIGHT[fg]} on ${bg} ${LIGHT[bg]} = ${r.toFixed(2)}`);
    }
  }
  assert.ok(contrast("#FFFFFF", LIGHT.gold) >= AA);
});

test("the base brand tokens are the specified values", () => {
  assert.deepEqual([DARK.bg, DARK.surface, DARK.gold, DARK.action, DARK.text, DARK.textSub, DARK.border],
    ["#0B0D10", "#15191F", "#B89450", "#C9A968", "#F5F2EB", "#B7BBC4", "#262B33"]);
});

// Source audit: colours measured below AA must not be reintroduced.
const SRC = path.resolve(import.meta.dirname, "../src");
const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
  const p = path.join(d, e.name);
  if (e.isDirectory()) { if (!["supabase", "assets"].includes(e.name)) walk(p); }
  else if (/\.(jsx?|css)$/.test(e.name) && e.name !== "tokens.js") files.push(p);   // tokens.js documents the retired values
} })(SRC);

test("retired low-contrast text colours are gone from the app", () => {
  // #4A4F5A (2.4:1), #5C6270 (3.0:1), #7A7F8A (4.4:1 on cards) on dark; #A1A1AA (2.3:1) on the light portal.
  const offenders = [];
  for (const f of files) {
    const s = fs.readFileSync(f, "utf8");
    for (const hex of ["#4A4F5A", "#5C6270", "#7A7F8A", "#A1A1AA"]) if (s.toUpperCase().includes(hex)) offenders.push(`${path.basename(f)} ${hex}`);
  }
  assert.deepEqual(offenders, []);
});

test("#8B6914 is retired for interactive text (light portal uses the AA token #7A5C12)", () => {
  const offenders = files.filter((f) => fs.readFileSync(f, "utf8").toUpperCase().includes("#8B6914")).map((f) => path.basename(f));
  assert.deepEqual(offenders, []);
});

test("light tenant screens don't use dark-theme status colours as text (all below 3.2:1 on white)", () => {
  const offenders = [];
  for (const f of files) {
    const s = fs.readFileSync(f, "utf8");
    if (!/#F5F3EE/i.test(s) || /#0B0D10/i.test(s)) continue;          // light screens only
    for (const hex of ["#F0A430", "#4A9AE8", "#72B02A", "#E05555"]) if (s.toUpperCase().includes(hex)) offenders.push(`${path.basename(f)} ${hex}`);
  }
  assert.deepEqual(offenders, []);
});
