// DEV-ONLY fixture backend for visual QA of authenticated screens (never bundled in a production build).
// Enabled only by `MODUS_FIXTURES=1 npx vite` (see vite.config.js); production builds import the real client.
// Every record here is invented test data. Nothing talks to Supabase, Stripe or email. Writes stay in memory.
// Switch persona with ?as=landlord | ?as=tenant (remembered in localStorage).

const now = new Date();
const iso = (daysAgo, h = 10) => { const d = new Date(now); d.setDate(d.getDate() - daysAgo); d.setHours(h, 0, 0, 0); return d.toISOString(); };
const day = (offset) => { const d = new Date(now); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); };
let seq = 1000;
const uid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

const LANDLORD = { id: "11111111-1111-4111-8111-111111111111", email: "owner@fixture.test", user_metadata: { full_name: "Fixture Owner", role: "landlord" } };
const TENANT_USER = { id: "22222222-2222-4222-8222-222222222222", email: "tenant@fixture.test", user_metadata: { full_name: "Tara Tenant" } };

const P1 = "aaaaaaaa-0000-4000-8000-000000000001", P2 = "aaaaaaaa-0000-4000-8000-000000000002";
const U = (n) => `bbbbbbbb-0000-4000-8000-${String(n).padStart(12, "0")}`;
const T = (n) => `cccccccc-0000-4000-8000-${String(n).padStart(12, "0")}`;

const db = {
  profiles: [{ id: LANDLORD.id, role: "landlord" }, { id: TENANT_USER.id, role: "tenant" }],
  properties: [
    { id: P1, name: "Clifton Manor (fixture)", address: "100 Example St", city: "Cleveland", state: "OH", zip: "44102" },
    { id: P2, name: "Lakeview Court (fixture)", address: "200 Sample Ave", city: "Cleveland", state: "OH", zip: "44107" },
  ],
  units: [
    { id: U(1), property_id: P1, unit_number: "1", rent_amount: 1150, payment_due_day: 1 },
    { id: U(2), property_id: P1, unit_number: "2", rent_amount: 1095, payment_due_day: 1 },
    { id: U(3), property_id: P1, unit_number: "3", rent_amount: 1225, payment_due_day: 1 },
    { id: U(4), property_id: P1, unit_number: "12A — Garden level with a deliberately long unit label", rent_amount: 1400, payment_due_day: 1 },
    { id: U(5), property_id: P2, unit_number: "101", rent_amount: 980, payment_due_day: 5 },
    { id: U(6), property_id: P2, unit_number: "102", rent_amount: 990, payment_due_day: 5 },
  ],
  tenants: [
    { id: T(1), unit_id: U(2), name: "Tara Tenant", email: "tenant@fixture.test", phone: "(216) 555-0142", user_id: TENANT_USER.id, lease_start: day(-300), lease_end: day(45), rent_due_day: 1, security_deposit: 1095, archived: false, invite_sent_at: iso(320) },
    { id: T(2), unit_id: U(3), name: "Marcus Longname-Hyphenated Example", email: "marcus@fixture.test", phone: "(216) 555-0131", user_id: "u-2", lease_start: day(-100), lease_end: day(265), rent_due_day: 1, archived: false },
    { id: T(3), unit_id: U(5), name: "Priya Patel", email: "priya@fixture.test", phone: "440-555-0199", user_id: null, invite_sent_at: iso(6), lease_start: day(-20), lease_end: day(345), archived: false, insurance_expires: day(9) },
    { id: T(4), unit_id: U(1), name: "Former Resident", email: "former@fixture.test", phone: null, user_id: null, lease_start: day(-700), lease_end: day(-40), archived: true },
  ],
  vendors: [
    { id: uid(), property_id: P1, name: "Handyman Contractor Services", phone: "(216) 555-0170", category: "general", active: true, notes: "#preferred" },
    { id: uid(), property_id: null, name: "Rob's Electrician", phone: "(216) 555-0110", category: "electrical", active: true },
  ],
  maintenance_requests: [
    { id: uid(), tenant_id: T(1), unit_id: U(2), title: "Kitchen faucet drips constantly", description: "Drips every few seconds even when closed tight.", category: "plumbing", status: "open", priority: "normal", created_at: iso(3), updated_at: iso(3), photos: [] },
    { id: uid(), tenant_id: T(2), unit_id: U(3), title: "Water leaking through the bathroom ceiling", description: "Steady drip from the light fixture.", category: "plumbing", status: "open", priority: "urgent", is_emergency: true, created_at: iso(0, 7), updated_at: iso(0, 7), photos: [] },
    { id: uid(), tenant_id: T(1), unit_id: U(2), title: "Bedroom door sticks", category: "other", status: "quote_submitted", priority: "low", vendor_name: "Handyman Contractor Services", work_order_accepted_at: iso(2), quote_amount: 140, quote_submitted_at: iso(1), quote_notes: "Plane door, adjust hinges.", created_at: iso(6), updated_at: iso(1), photos: [] },
    { id: uid(), tenant_id: T(3), unit_id: U(5), title: "Smoke detector chirping", category: "electrical", status: "in_progress", priority: "high", vendor_name: "Rob's Electrician", created_at: iso(4), updated_at: iso(2), photos: [] },
    { id: uid(), tenant_id: T(2), unit_id: U(3), title: "Garbage disposal jammed", category: "appliance", status: "pending_review", priority: "normal", vendor_name: "Handyman Contractor Services", work_order_accepted_at: iso(9), quote_amount: 95, quote_submitted_at: iso(8), quote_approved_at: iso(8), invoice_notes: "95", created_at: iso(10), updated_at: iso(1), photos: [] },
    { id: uid(), tenant_id: T(1), unit_id: U(2), title: "Hallway light out", category: "electrical", status: "resolved", priority: "low", created_at: iso(20), updated_at: iso(18), resolved_at: iso(18), cost: 25, photos: [] },
  ],
  maintenance_comments: [],
  incident_logs: [
    { id: 1, tenant_id: T(1), property_id: P1, category: "PARKING_DISPUTE", status: "open", created_at: iso(1), details_json: { intent_summary: "Unknown car parked in assigned space #4", owner_topic_kind: "parking" } },
    { id: 2, tenant_id: T(3), property_id: P2, category: "TRASH", status: "open", created_at: iso(2), details_json: { intent_summary: "Dumpster overflowing behind building B", owner_topic_kind: "trash" } },
  ],
  payments: [
    { id: uid(), tenant_id: T(2), unit_id: U(3), amount_cents: 122500, status: "paid", category: "rent", source: "check", paid_at: iso(12), created_at: iso(12), voided_at: null },
    { id: uid(), tenant_id: T(1), unit_id: U(2), amount_cents: 109500, status: "paid", category: "rent", source: "ach", paid_at: iso(2), created_at: iso(2), voided_at: null },
    { id: uid(), tenant_id: T(3), unit_id: U(5), amount_cents: 98000, status: "failed", category: "rent", source: "stripe", stripe_payment_intent_id: "pi_fixture", created_at: iso(5), voided_at: null },
  ],
  payment_refunds: [],
  recurring_charges: [
    { id: uid(), tenant_id: T(1), category: "Rent", amount: 1095, start_date: day(-300), end_date: null, created_at: iso(300) },
    { id: uid(), tenant_id: T(1), category: "Parking", amount: 40, start_date: day(-300), end_date: null, created_at: iso(300) },
  ],
  expenses: [
    { id: uid(), property_id: P1, unit_id: U(2), category: "repairs", description: "Hallway light", amount: 25, vendor_name: "Handyman Contractor Services", date: day(-18), paid_at: day(-15), voided_at: null, created_at: iso(18) },
    { id: uid(), property_id: P2, unit_id: null, category: "landscaping", description: "Fall cleanup", amount: 320, vendor_name: "Green Co", date: day(-6), paid_at: null, voided_at: null, created_at: iso(6) },
  ],
  messages: [
    { id: uid(), tenant_id: T(1), sender_id: TENANT_USER.id, recipient_id: null, body: "Is there a spare parking space for a guest this weekend?", created_at: iso(1, 9), read: true },
    { id: uid(), tenant_id: T(1), sender_id: null, recipient_id: TENANT_USER.id, agent_name: "Modus AI Assistant", body: "Guest parking is in the marked visitor spaces near the north entrance. Management will confirm if you need a reserved space.", created_at: iso(1, 9), read: false },
  ],
  landlord_alerts: [], agent_escalation_events: [], ai_routing_logs: [], applications: [], inspections: [], bulletins: [], bulletin_comments: [], bulletin_likes: [],
  a2_late_fee_exemptions: [], tenant_charges: [], audit_logs: [], audit_requests: [],
  ownership_entities: [], accounting_entities: [], app_settings: [], organizations: [], organization_members: [],
};

// Embedded relations, attached to every returned row (extra fields are harmless to the screens).
const byId = (t, id) => db[t].find((r) => r.id === id) || null;
const withProp = (u) => (u ? { ...u, properties: byId("properties", u.property_id) } : null);
const REL = {
  maintenance_requests: (r) => ({ units: withProp(byId("units", r.unit_id)), tenants: byId("tenants", r.tenant_id) }),
  tenants: (r) => ({ units: withProp(byId("units", r.unit_id)) }),
  payments: (r) => ({ units: withProp(byId("units", r.unit_id)), tenants: byId("tenants", r.tenant_id) }),
  units: (r) => ({ properties: byId("properties", r.property_id) }),
  incident_logs: (r) => ({ properties: byId("properties", r.property_id), tenants: byId("tenants", r.tenant_id) }),
  expenses: (r) => ({ properties: byId("properties", r.property_id) }),
  recurring_charges: (r) => ({ tenants: byId("tenants", r.tenant_id) }),
  messages: (r) => ({ tenants: byId("tenants", r.tenant_id) }),
};
const get = (row, path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), row);
const log = (...a) => console.info("[fixture]", ...a);

class Query {
  constructor(table) { this.table = table; this.preds = []; this.op = "select"; this.payload = null; this.orders = []; this.max = null; this.mode = "many"; }
  select() { if (this.op === "select") this.op = "select"; else this.returning = true; return this; }
  eq(c, v) { this.preds.push((r) => get(r, c) === v); return this; }
  neq(c, v) { this.preds.push((r) => get(r, c) !== v); return this; }
  is(c, v) { this.preds.push((r) => (v === null ? get(r, c) == null : get(r, c) === v)); return this; }
  in(c, vs) { this.preds.push((r) => vs.includes(get(r, c))); return this; }
  gte(c, v) { this.preds.push((r) => get(r, c) >= v); return this; }
  gt(c, v) { this.preds.push((r) => get(r, c) > v); return this; }
  lte(c, v) { this.preds.push((r) => get(r, c) <= v); return this; }
  lt(c, v) { this.preds.push((r) => get(r, c) < v); return this; }
  ilike(c, v) { const re = new RegExp("^" + String(v).replace(/%/g, ".*") + "$", "i"); this.preds.push((r) => re.test(String(get(r, c) ?? ""))); return this; }
  filter(c, op, v) { return op === "eq" ? this.eq(c, v) : op === "in" ? this.in(c, String(v).replace(/[()]/g, "").split(",")) : this; }
  or() { return this; } not() { return this; } contains() { return this; } match(o) { Object.entries(o).forEach(([k, v]) => this.eq(k, v)); return this; }
  order(c, { ascending = true } = {}) { this.orders.push([c, ascending]); return this; }
  limit(n) { this.max = n; return this; } range(a, b) { this.max = b - a + 1; return this; }
  single() { this.mode = "single"; return this; } maybeSingle() { this.mode = "maybe"; return this; }
  insert(rows) { this.op = "insert"; this.payload = rows; return this; }
  upsert(rows) { this.op = "upsert"; this.payload = rows; return this; }
  update(patch) { this.op = "update"; this.payload = patch; return this; }
  delete() { this.op = "delete"; return this; }
  rows() { return (db[this.table] ||= []).map((r) => ({ ...r, ...(REL[this.table] ? REL[this.table](r) : {}) })); }
  run() {
    const t = (db[this.table] ||= []);
    let out;
    if (this.op === "insert" || this.op === "upsert") {
      const list = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((r) => ({ id: r.id || uid(), created_at: new Date().toISOString(), ...r }));
      for (const r of list) { const i = t.findIndex((x) => x.id === r.id); if (i >= 0) t[i] = { ...t[i], ...r }; else t.push(r); }
      log(this.op, this.table, list); out = list;
    } else if (this.op === "update" || this.op === "delete") {
      const hit = t.filter((r) => this.preds.every((p) => p({ ...r, ...(REL[this.table] ? REL[this.table](r) : {}) })));
      if (this.op === "update") hit.forEach((r) => Object.assign(r, this.payload)); else db[this.table] = t.filter((r) => !hit.includes(r));
      log(this.op, this.table, hit.length, this.payload || ""); out = hit;
    } else {
      out = this.rows().filter((r) => this.preds.every((p) => p(r)));
      for (const [c, asc] of [...this.orders].reverse()) out.sort((a, b) => ((get(a, c) ?? "") > (get(b, c) ?? "") ? 1 : (get(a, c) ?? "") < (get(b, c) ?? "") ? -1 : 0) * (asc ? 1 : -1));
      if (this.max != null) out = out.slice(0, this.max);
    }
    if (this.mode === "single") return out.length === 1 ? { data: out[0], error: null } : { data: null, error: { message: `fixture: expected one row, got ${out.length}` } };
    if (this.mode === "maybe") return { data: out[0] || null, error: null };
    return { data: out, error: null, count: out.length };
  }
  then(res, rej) { return new Promise((r) => setTimeout(r, 120)).then(() => this.run()).then(res, rej); }
}

// Fixture versions of the server RPCs the screens call. The audited_* ones mirror the server contract (reason,
// request id, duplicate refusal) so the confirmation UI can be exercised; the real enforcement is the migration.
const usedRequests = new Set();
const requireAudit = (reason, req) => {
  if (!persona().landlord) return { message: "Landlord access required", code: "42501" };
  if (!reason || reason.trim().length < 3) return { message: "A reason is required", code: "22023" };
  if (!req) return { message: "a request id is required", code: "22023" };
  if (usedRequests.has(req)) return { message: `this request was already submitted (duplicate ${req})`, code: "23505" };
  usedRequests.add(req); return null;
};
const RPC = {
  landlord_vendor_access: () => ({ data: [{ vendor_token: "fixture-token", vendor_pin: "0000", vendor_token_expires_at: iso(-5) }] }),
  a2_status: () => ({ data: { active: false } }),
  a2_pay_rent_due: () => ({ data: { ledger_active: false } }),
  a3_pay_rent_due: () => ({ data: { ledger_active: false } }),
  a2_tenant_balances: () => ({ data: [] }),
  audit_features: () => ({ data: { audit_logs: true } }),
  audited_record_manual_payment: (a) => {
    const e = requireAudit(a.p_reason, a.p_request); if (e) return { error: e };
    const t = byId("tenants", a.p_tenant);
    const ids = a.p_lines.map((l) => { const id = uid(); db.payments.push({ id, tenant_id: a.p_tenant, unit_id: t?.unit_id, category: l.category, amount_cents: l.cents, paid_at: a.p_paid_at, source: a.p_method, status: "paid", created_at: new Date().toISOString() }); return id; });
    db.audit_logs.push({ id: db.audit_logs.length + 1, action: "payments.insert", reason: a.p_reason, request_id: a.p_request, occurred_at: new Date().toISOString() });
    log("audited_record_manual_payment", a); return { data: ids };
  },
  audited_update_lease: (a) => {
    const e = requireAudit(a.p_reason, a.p_request); if (e) return { error: e };
    const t = byId("tenants", a.p_tenant); const keys = ["lease_start", "lease_end", "security_deposit", "rent_due_day", "lease_end_action"];
    const before = Object.fromEntries(keys.map((k) => [k, t[k] ?? null])); Object.assign(t, a.p_changes);
    const after = Object.fromEntries(keys.map((k) => [k, t[k] ?? null]));
    db.audit_logs.push({ id: db.audit_logs.length + 1, action: "tenants.lease_update", reason: a.p_reason, request_id: a.p_request, before, after });
    log("audited_update_lease", a); return { data: { before, after } };
  },
  audited_void_expense: (a) => {
    const e = requireAudit(a.p_reason, a.p_request); if (e) return { error: e };
    const x = byId("expenses", a.p_expense); if (!x || x.voided_at) return { error: { message: "Expense not found or already void", code: "22023" } };
    x.voided_at = new Date().toISOString(); db.audit_logs.push({ id: db.audit_logs.length + 1, action: "expenses.void", reason: a.p_reason, request_id: a.p_request });
    log("audited_void_expense", a); return { data: null };
  },
};

function persona() {
  let as = "landlord";
  try { const q = new URLSearchParams(location.search).get("as"); if (q) localStorage.setItem("modus.fixture.as", q); as = localStorage.getItem("modus.fixture.as") || "landlord"; } catch { /* default */ }
  return as === "tenant" ? { user: TENANT_USER, landlord: false } : { user: LANDLORD, landlord: true };
}

export const supabase = {
  from: (t) => new Query(t),
  rpc: async (name, args = {}) => { await new Promise((r) => setTimeout(r, 150)); const f = RPC[name]; const out = f ? f(args) : { data: null }; return { data: out.data ?? null, error: out.error ?? null }; },
  auth: {
    getUser: async () => ({ data: { user: persona().user }, error: null }),
    getSession: async () => ({ data: { session: { access_token: "fixture", user: persona().user } }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: async () => ({ error: null }), signInWithPassword: async () => ({ data: {}, error: null }),
    updateUser: async () => ({ data: {}, error: null }), resetPasswordForEmail: async () => ({ data: {}, error: null }),
  },
  functions: { invoke: async (n) => { log("functions.invoke blocked", n); return { data: null, error: { message: "Fixture mode: server functions are disabled" } }; } },
  storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "" }, error: null }), upload: async () => ({ data: {}, error: null }), remove: async () => ({ data: {}, error: null }), getPublicUrl: () => ({ data: { publicUrl: "" } }) }) },
  channel: () => ({ on() { return this; }, subscribe() { return this; } }),
  removeChannel: () => {},
};

export async function authHeaders() { return { "Content-Type": "application/json", Authorization: "Bearer fixture" }; }
