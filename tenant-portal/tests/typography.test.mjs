// Shared typography: one app font (Inter via --m-font), the serif only for the wordmark and marketing, no heavy weights.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve(import.meta.dirname, "../src");
const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
  const p = path.join(d, e.name);
  if (e.isDirectory()) { if (!["supabase", "dev"].includes(e.name)) walk(p); }
  else if (/\.(jsx?|css)$/.test(e.name)) files.push(p);
} })(SRC);
const text = (f) => fs.readFileSync(f, "utf8");

test("fonts are loaded once (index.html), not per screen", () => {
  const html = fs.readFileSync(path.resolve(import.meta.dirname, "../index.html"), "utf8");
  assert.match(html, /family=Inter:wght@400;500;600/);
  const offenders = files.filter((f) => /fonts\.googleapis\.com/.test(text(f))).map((f) => path.basename(f));
  assert.deepEqual(offenders, []);
});

test("app UI uses the one sans family; DM Sans / DM Mono are gone", () => {
  const offenders = [];
  for (const f of files) {
    const s = text(f).replace(/return `<div style="font-family:'DM Sans',Arial[\s\S]*?`;/g, ""); // inspection e-mail HTML
    if (/'DM (Sans|Mono)'/.test(s)) offenders.push(path.basename(f));
  }
  assert.deepEqual(offenders, []);
});

test("the serif appears only as the brand font (wordmark, marketing, e-mail HTML)", () => {
  const offenders = [];
  for (const f of files) {
    for (const line of text(f).split(/\r?\n/)) {
      if (/'Cormorant Garamond'/.test(line) && !/Georgia/.test(line)) offenders.push(`${path.basename(f)}: ${line.trim().slice(0, 60)}`);
    }
  }
  assert.deepEqual(offenders, []);
  const css = text(path.join(SRC, "index.css"));
  assert.match(css, /--m-font: "Inter"/);
  assert.match(css, /--m-font-brand: "Cormorant Garamond"/);
});

test("no 700/800/bold weights in the app (titles and buttons are 600 at most)", () => {
  const offenders = [];
  for (const f of files) {
    const s = text(f);
    // Literal weights only ("bold" as a quoted value; a `bold ? 600 : 400` variable expression is fine).
    if (/fontWeight:\s*(?:"(?:700|800|bold)"|(?:700|800)(?=[\s,}]))/.test(s)) offenders.push(path.basename(f));
  }
  assert.deepEqual(offenders, []);
});

test("responsive type scale tokens exist (title / section / stat) with smaller phone sizes", () => {
  const css = text(path.join(SRC, "index.css"));
  assert.match(css, /--m-fs-title: 26px; --m-fs-section: 19px; --m-fs-stat: 24px;/);
  assert.match(css, /@media \(max-width: 720px\) \{ :root \{ --m-fs-title: 23px; --m-fs-section: 17px; --m-fs-stat: 21px; \} \}/);
});
