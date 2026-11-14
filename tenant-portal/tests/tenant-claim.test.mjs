// tests/tenant-claim.test.mjs
// Regression tests for linking a portal login to a tenant record (src/lib/tenantClaim.js + TenantOnboarding.jsx).
// The fake client applies production's rules for the tenants table (verified 2026-11-13):
//   - landlords (profiles.role = 'landlord') may update any row (landlord_full_tenants; the column guard skips them);
//   - other users may claim only a row with user_id IS NULL whose email/invite_email equals their verified email,
//     setting user_id to themselves (RLS "Tenants can find their own record by email" + protect_tenant_columns);
//     a mismatch matches 0 rows; a claimed row can't be reassigned.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { claimTenantRecord, isManagementAccount, CLAIM_MESSAGES } = await import("../src/lib/tenantClaim.js");
const { inviteLinkState } = await import("../src/lib/onboardingLink.js");

const A = "11111111-1111-4111-8111-111111111111"; // invited tenant record (unclaimed)
const B = "22222222-2222-4222-8222-222222222222"; // another tenant's record (claimed)
const users = {
  landlord: { id: "aaaaaaaa-0000-4000-8000-000000000001", email: "owner@example.test", role: "landlord", verified: true },
  invitee:  { id: "aaaaaaaa-0000-4000-8000-000000000002", email: "invitee@example.test", role: "tenant", verified: true },
  other:    { id: "aaaaaaaa-0000-4000-8000-000000000003", email: "other@example.test", role: "tenant", verified: true },
  unverified: { id: "aaaaaaaa-0000-4000-8000-000000000004", email: "invitee@example.test", role: "tenant", verified: false },
};

function fakeDb({ as, profileError = false } = {}) {
  const tenants = [
    { id: A, email: "invitee@example.test", invite_email: null, user_id: null, name: "Invitee" },
    { id: B, email: "other@example.test", invite_email: null, user_id: users.other.id, name: "Other" },
  ];
  const writes = [];
  const me = as ? users[as] : null;
  const canSee = (r) => me && (me.role === "landlord" || r.user_id === me.id ||
    (r.user_id === null && me.verified && [r.email, r.invite_email].includes(me.email)));
  const client = {
    auth: { getUser: async () => ({ data: { user: me ? { id: me.id, email: me.email } : null } }) },
    from(table) {
      const filters = []; let patch = null; let wantRows = false;
      const q = {
        select() { wantRows = true; return q; },
        update(v) { patch = v; return q; },
        eq(c, v) { filters.push((r) => r[c] === v); return q; },
        is(c, v) { filters.push((r) => r[c] === v); return q; },
        async maybeSingle() {
          if (table === "profiles") {
            if (profileError) return { data: null, error: { message: "permission denied" } };
            const u = Object.values(users).find(x => filters.every(f => f({ id: x.id })));
            return { data: u ? { role: u.role } : null, error: null };
          }
          const rows = tenants.filter(r => canSee(r) && filters.every(f => f(r)));
          return { data: rows[0] ? { id: rows[0].id } : null, error: null };
        },
        then(res, rej) { return Promise.resolve(q.run()).then(res, rej); },
        run() {
          if (table !== "tenants" || !patch) return { data: null, error: null };
          const hit = tenants.filter(r => filters.every(f => f(r)) && (me?.role === "landlord" ||
            (r.user_id === null && me?.verified && [r.email, r.invite_email].includes(me?.email) && patch.user_id === me.id)));
          for (const r of hit) { Object.assign(r, patch); writes.push({ id: r.id, ...patch }); }
          return { data: wantRows ? hit.map(r => ({ id: r.id })) : null, error: null };
        },
      };
      return q;
    },
  };
  return { client, tenants, writes };
}

describe("claimTenantRecord: authorization before any account link", () => {
  test("a landlord/management session cannot claim a tenant record (nothing is written)", async () => {
    const { client, tenants, writes } = fakeDb({ as: "landlord" });
    assert.deepEqual(await claimTenantRecord(client, A), { ok: false, reason: "management" });
    assert.equal(writes.length, 0);
    assert.equal(tenants[0].user_id, null);
  });

  test("if the account's role can't be read it is treated as management (fail closed)", async () => {
    const { client, writes } = fakeDb({ as: "invitee", profileError: true });
    assert.equal((await claimTenantRecord(client, A)).reason, "management");
    assert.equal(writes.length, 0);
    assert.equal(await isManagementAccount({ from() { throw new Error("offline"); } }, "x"), true);
  });

  test("a signed-in tenant cannot claim a different tenant's record (unclaimed or claimed)", async () => {
    const { client, tenants, writes } = fakeDb({ as: "other" });
    assert.deepEqual(await claimTenantRecord(client, A), { ok: false, reason: "mismatch" });
    assert.equal(tenants[0].user_id, null, "invitee's record stays unclaimed");
    const db2 = fakeDb({ as: "invitee" });
    assert.deepEqual(await claimTenantRecord(db2.client, B), { ok: false, reason: "mismatch" });
    assert.equal(db2.tenants[1].user_id, users.other.id, "a claimed record is never reassigned");
    assert.equal(writes.length + db2.writes.length, 0);
  });

  test("only the intended, verified email claims the invitation, and only user_id is written", async () => {
    const unverified = fakeDb({ as: "unverified" });
    assert.equal((await claimTenantRecord(unverified.client, A)).reason, "mismatch");
    assert.equal(unverified.writes.length, 0);

    const { client, tenants, writes } = fakeDb({ as: "invitee" });
    assert.deepEqual(await claimTenantRecord(client, A), { ok: true, tenantId: A, userId: users.invitee.id });
    assert.deepEqual(writes, [{ id: A, user_id: users.invitee.id }]);
    assert.equal(tenants[0].name, "Invitee");
    // Opening the link again: already linked to the same account → ok, nothing re-written.
    assert.equal((await claimTenantRecord(client, A)).ok, true);
    assert.equal(writes.length, 1);
  });

  test("no session or a malformed tenant id → refused before touching the database", async () => {
    const { client, writes } = fakeDb({});
    assert.equal((await claimTenantRecord(client, A)).reason, "signin");
    const db = fakeDb({ as: "invitee" });
    for (const bad of [null, "", "abc", `${A}' or 1=1`]) assert.equal((await claimTenantRecord(db.client, bad)).reason, "invalid");
    assert.equal(writes.length + db.writes.length, 0);
    for (const r of ["signin", "invalid", "management", "mismatch"]) assert.ok(CLAIM_MESSAGES[r]);
  });
});

describe("expired, invalid and used invitations never reach the claim", () => {
  const STATES = [
    { hash: "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired" },
    { hash: "#error=access_denied&error_code=otp_expired", hasSession: true },
    { search: "?error=unauthorized_client&error_code=bad_jwt", hasSession: true },
    { hash: "#error=server_error" },
    {},
  ];
  test("none of these link states is 'ready' (the only state that runs the claim)", () => {
    for (const s of STATES) assert.notEqual(inviteLinkState(s).state, "ready", JSON.stringify(s));
    assert.equal(inviteLinkState({ hasSession: true, isManagement: true }).state, "management");
  });

  test("the onboarding page claims only through claimTenantRecord, only in the 'ready' state, before other writes", () => {
    const src = readFileSync(new URL("../src/TenantOnboarding.jsx", import.meta.url), "utf8");
    assert.match(src, /if \(!invitedTenantId\|\|autoLinked\|\|linkState\.state!=="ready"\) return;/);
    assert.equal((src.match(/update\(\{\s*user_id/g) || []).length, 0, "no direct user_id writes left in the page");
    assert.equal((src.match(/claimTenantRecord\(supabase,/g) || []).length, 2);
    // The page never renders the forms (and their save handlers) unless the link state is ready.
    assert.match(src, /if \(linkState\.state !== "ready"\) \{/);
    // Property-code path: the name/phone write comes after a successful claim and is scoped to the claiming user.
    const p = src.indexOf("async function handlePropertyCode");
    const claimAt = src.indexOf("claimTenantRecord(supabase, tenantData.id)", p);
    const refuseAt = src.indexOf("if (!claim.ok)", claimAt);
    const writeAt = src.indexOf('.update({ name:fullName||tenantData.name, phone }).eq("id",tenantData.id).eq("user_id", user.id)', p);
    assert.ok(p > 0 && claimAt > p && refuseAt > claimAt && writeAt > refuseAt);
  });
});
