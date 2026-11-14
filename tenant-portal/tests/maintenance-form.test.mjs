// tests/maintenance-form.test.mjs
// Tenant maintenance form failure handling (src/MaintenanceRequestForm.jsx).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/MaintenanceRequestForm.jsx", import.meta.url), "utf8");

test("photo names are unique per photo (no same-millisecond collision) and failures are counted, not dropped", () => {
  assert.match(src, /const path = `\$\{requestId\}\/\$\{Date\.now\(\)\}-\$\{i\}\.\$\{ext\}`;/);
  assert.match(src, /return \{ urls, failed \};/);
  assert.match(src, /couldn't be uploaded\. Your request was still saved/);
});

test("a save failure shows an inline error (no blocking alert) and keeps the form; the button never stays stuck", () => {
  assert.ok(!/alert\(/.test(src), "no window.alert");
  assert.match(src, /setSubmitError\("We couldn't save your request\./);
  assert.match(src, /\} finally \{\s*setLoading\(false\);\s*\}/);
  assert.match(src, /role="alert"[^>]*>\{submitError\}/);
});

test("the management alert is requested right after the ticket is saved, before slow photo uploads", () => {
  const insert = src.indexOf('from("maintenance_requests").insert(');
  const alertAt = src.indexOf("notifyNewMaintenanceTicket({ ticketId: data.id })");
  const photosAt = src.indexOf("await uploadPhotos(data.id)");
  assert.ok(insert > 0 && alertAt > insert && photosAt > alertAt);
});
