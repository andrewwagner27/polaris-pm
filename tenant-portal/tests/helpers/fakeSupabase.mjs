// tests/helpers/fakeSupabase.mjs
// A small in-memory stand-in for the supabase-js query builder: select / insert / update with eq, neq, in,
// not(col, "is", null), is, order, limit, single, maybeSingle. Embedded relations are stored on the rows already
// (e.g. maintenance_requests rows carry `tenants` and `units` objects). Enough for the maintenance follow-up tests.
export function fakeSupabase(tables) {
  let seq = 0;
  const from = (name) => {
    tables[name] ||= [];
    const filters = [];
    let op = "select", payload = null, order = null, limit = null, wantOne = null, returning = false;
    const q = {
      select() { if (op !== "select") returning = true; return q; },
      insert(rows) { op = "insert"; payload = Array.isArray(rows) ? rows : [rows]; return q; },
      update(patch) { op = "update"; payload = patch; return q; },
      eq(c, v) { filters.push((r) => r[c] === v); return q; },
      neq(c, v) { filters.push((r) => r[c] !== v); return q; },
      in(c, vs) { filters.push((r) => vs.includes(r[c])); return q; },
      is(c, v) { filters.push((r) => (r[c] ?? null) === v); return q; },
      not(c, o, v) { filters.push((r) => !(o === "is" && (r[c] ?? null) === v)); return q; },
      order(c, { ascending = true } = {}) { order = { c, ascending }; return q; },
      limit(n) { limit = n; return q; },
      single() { wantOne = "single"; return q; },
      maybeSingle() { wantOne = "maybe"; return q; },
      then(resolve, reject) { return Promise.resolve(run()).then(resolve, reject); },
    };
    const match = (r) => filters.every((f) => f(r));
    function run() {
      const t = tables[name];
      if (op === "insert") {
        const rows = payload.map((r) => ({ id: r.id || `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`, created_at: r.created_at || new Date(fakeSupabase.now?.() ?? Date.now()).toISOString(), ...r }));
        t.push(...rows);
        return { data: returning ? (wantOne ? rows[0] : rows) : null, error: null };
      }
      if (op === "update") {
        const hit = t.filter(match); hit.forEach((r) => Object.assign(r, payload));
        return { data: returning ? hit : null, error: null };
      }
      let rows = t.filter(match);
      if (order) rows = rows.slice().sort((a, b) => String(a[order.c]).localeCompare(String(b[order.c])) * (order.ascending ? 1 : -1));
      if (limit != null) rows = rows.slice(0, limit);
      if (wantOne) return { data: rows[0] ?? null, error: wantOne === "single" && !rows.length ? { message: "no rows" } : null };
      return { data: rows.map((r) => ({ ...r })), error: null };
    }
    return q;
  };
  return { from, tables };
}
