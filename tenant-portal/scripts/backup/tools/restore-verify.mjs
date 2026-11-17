// Restore a Modus pg_dump archive into an ISOLATED local PostgreSQL and verify it.
// Usage: node restore-verify.mjs <archive.dump> <report.json> [--keep]
// Safety: the target is hard-coded to 127.0.0.1:55432 (the local restore-test cluster). It refuses anything else.
// Output contains counts, hashes and object names only - never row contents.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFileSync, existsSync } from "node:fs";

const BIN = "C:\\Program Files\\PostgreSQL\\17\\bin";
const HOST = "127.0.0.1", PORT = "55432", DB = "modus_restore_check";
const [archive, reportPath, ...flags] = process.argv.slice(2);
if (!archive || !reportPath || !existsSync(archive)) { console.error("usage: node restore-verify.mjs <archive> <report.json> [--keep]"); process.exit(2); }

// Never let ambient PG* variables (e.g. production PGHOST/PGPASSWORD) reach the local tools.
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^PG/i.test(k)));
const conn = ["-h", HOST, "-p", PORT, "-U", "postgres"];
const SESSION = "-c timezone=UTC -c datestyle=ISO -c intervalstyle=postgres -c extra_float_digits=3 -c client_encoding=UTF8";
const run = (exe, args, opts = {}) => spawnSync(`${BIN}\\${exe}`, args, { env: { ...env, PGOPTIONS: SESSION }, maxBuffer: 1 << 30, ...opts });
const psql = (db, sql) => {
  const r = run("psql.exe", ["-X", "-At", "-v", "ON_ERROR_STOP=1", ...conn, "-d", db, "-c", sql]);
  if (r.status !== 0) throw new Error(`psql failed: ${r.stderr.toString().slice(0, 400)}`);
  return r.stdout.toString().replace(/\r/g, "");
};
const report = { archive, startedAt: new Date().toISOString(), checks: [], ok: false };
const check = (name, pass, detail) => { report.checks.push({ name, pass, detail }); console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`); };

try {
  if (HOST !== "127.0.0.1" || PORT !== "55432") throw new Error("refusing non-local target");
  psql("postgres", "select 1");

  // 1. Archive table of contents
  const toc = run("pg_restore.exe", ["-l", archive]);
  if (toc.status !== 0) throw new Error("archive unreadable: " + toc.stderr.toString().slice(0, 300));
  const tocLines = toc.stdout.toString().split(/\r?\n/).filter((l) => /^\d+;/.test(l));
  const entry = (l) => { const m = l.match(/^\d+; \d+ \d+ (.+?) (\S+) (\S+) (\S+)$/); return m ? { type: m[1], schema: m[2], name: m[3] } : null; };
  const entries = tocLines.map(entry).filter(Boolean);
  const CORE = ["public", "auth", "storage"];
  const tocTables = entries.filter((e) => e.type === "TABLE" && CORE.includes(e.schema));
  const tocCount = (type, schemas) => tocLines.filter((l) => { const m = l.match(new RegExp(String.raw`^\d+; \d+ \d+ ` + type + String.raw` (\S+) `)); return m && schemas.includes(m[1]); }).length;
  const tocFks = tocCount("FK CONSTRAINT", CORE);
  report.archiveEntries = tocLines.length;

  // 2. Fresh isolated database + the Supabase roles that policies and grants refer to
  psql("postgres", `drop database if exists ${DB} with (force)`);
  psql("postgres", `create database ${DB}`);
  const roles = ["anon", "authenticated", "service_role", "authenticator", "supabase_admin", "supabase_auth_admin",
    "supabase_storage_admin", "dashboard_user", "pgbouncer", "supabase_realtime_admin", "supabase_replication_admin",
    "supabase_read_only_user", "supabase_functions_admin", "supabase_etl_admin"];
  psql(DB, roles.map((r) => `do $$ begin if not exists (select from pg_roles where rolname='${r}') then create role ${r} nologin; end if; end $$;`).join("\n"));

  // 3. Restore. Supabase-only extensions (pg_cron, pg_net, supabase_vault, pgsodium, pg_graphql) can't exist here:
  //    errors whose statement touches only those are expected; anything else fails the check.
  const rs = run("pg_restore.exe", ["--no-owner", "--no-acl", ...conn, "-d", DB, archive]);
  const errText = rs.stderr.toString().replace(/\r/g, "");
  const errors = errText.split(/(?=pg_restore: error:)/).filter((b) => b.startsWith("pg_restore: error:"));
  const EXPECTED = /pg_cron|pg_net|supabase_vault|pgsodium|pg_graphql|\bcron\.|\bnet\.|\bvault\.|\bgraphql\b|graphql_public|EXTENSION/i;
  const unexpected = errors.filter((e) => !EXPECTED.test(e));
  report.restoreErrors = { total: errors.length, expected: errors.length - unexpected.length, unexpected: unexpected.map((e) => e.slice(0, 500)) };
  check("restore: no unexpected errors", unexpected.length === 0, `${errors.length} errors, ${errors.length - unexpected.length} expected (Supabase-only extensions)`);

  // 4. Structure
  const restoredTables = psql(DB, `select table_schema||'.'||table_name from information_schema.tables where table_type='BASE TABLE' and table_schema in ('public','auth','storage')`).split("\n").filter(Boolean);
  const missing = tocTables.map((t) => `${t.schema}.${t.name}`).filter((t) => !restoredTables.includes(t));
  check("structure: every public/auth/storage table restored", missing.length === 0, `${tocTables.length} in archive, missing: ${missing.join(", ") || "none"}`);
  const fkRestored = Number(psql(DB, `select count(*) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where c.contype='f' and n.nspname in ('public','auth','storage')`));
  check("relationships: all foreign keys restored and validated", fkRestored === tocFks, `${fkRestored} of ${tocFks}`);
  const critical = ["public.properties", "public.units", "public.tenants", "public.profiles", "public.maintenance_requests", "public.messages", "auth.users", "storage.objects", "storage.buckets"];
  const critMissing = critical.filter((t) => !restoredTables.includes(t));
  check("structure: critical tables present", critMissing.length === 0, critMissing.join(", ") || critical.length + " tables");
  const pol = Number(psql(DB, `select count(*) from pg_policies where schemaname in ('public','storage')`));
  const polToc = tocCount("POLICY", ["public", "storage"]);
  check("security: RLS policies restored", pol === polToc, `${pol} of ${polToc}`);
  const fnToc = tocCount("FUNCTION", ["public"]);
  const fn = Number(psql(DB, `select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')`));
  check("structure: public functions restored", fn === fnToc, `${fn} of ${fnToc}`);

  // 5. Data: every row of every public/auth/storage table, archive vs restored (sorted-line SHA-256 + count)
  const data = run("pg_restore.exe", ["--data-only", "-f", "-", archive]).stdout.toString("utf8").replace(/\r/g, "").split("\n");
  const blocks = []; let cur = null;
  for (const line of data) {
    if (!cur) { const m = line.match(/^COPY (\S+?)\.(\S+) \((.*)\) FROM stdin;$/); if (m) cur = { schema: m[1].replace(/"/g, ""), table: m[2].replace(/"/g, ""), cols: m[3], lines: [] }; }
    else if (line === "\\.") { blocks.push(cur); cur = null; } else cur.lines.push(line);
  }
  const digest = (lines) => createHash("sha256").update([...lines].sort().join("\n")).digest("hex");
  let rowsTotal = 0; const mismatches = []; report.tables = {};
  for (const b of blocks.filter((b) => CORE.includes(b.schema))) {
    const q = `"${b.schema}"."${b.table}"`;
    const out = run("psql.exe", ["-X", "-At", ...conn, "-d", DB, "-c", `COPY ${q} (${b.cols}) TO STDOUT`]);
    const got = out.status === 0 ? out.stdout.toString("utf8").replace(/\r/g, "").split("\n").filter((l, i, a) => !(i === a.length - 1 && l === "")) : null;
    const same = got && got.length === b.lines.length && digest(got) === digest(b.lines);
    report.tables[`${b.schema}.${b.table}`] = { archiveRows: b.lines.length, restoredRows: got ? got.length : null, identical: !!same };
    rowsTotal += b.lines.length;
    if (!same) mismatches.push(`${b.schema}.${b.table}`);
  }
  check("data: every row identical to the archive (public/auth/storage)", mismatches.length === 0, `${Object.keys(report.tables).length} tables, ${rowsTotal} rows, mismatches: ${mismatches.join(", ") || "none"}`);

  // 6. Representative integrity (explicit orphan checks on the pilot's core chain; counts only)
  const has = (t, c) => psql(DB, `select count(*) from information_schema.columns where table_schema='public' and table_name='${t}' and column_name='${c}'`).trim() === "1";
  const orphan = [];
  if (has("units", "property_id")) orphan.push(["units→properties", `select count(*) from public.units u where u.property_id is not null and not exists (select 1 from public.properties p where p.id=u.property_id)`]);
  if (has("tenants", "unit_id")) orphan.push(["tenants→units", `select count(*) from public.tenants t where t.unit_id is not null and not exists (select 1 from public.units u where u.id=t.unit_id)`]);
  if (has("tenants", "user_id")) orphan.push(["tenants→auth.users", `select count(*) from public.tenants t where t.user_id is not null and not exists (select 1 from auth.users u where u.id=t.user_id)`]);
  if (has("maintenance_requests", "tenant_id")) orphan.push(["maintenance_requests→tenants", `select count(*) from public.maintenance_requests m where m.tenant_id is not null and not exists (select 1 from public.tenants t where t.id=m.tenant_id)`]);
  orphan.push(["storage.objects→buckets", `select count(*) from storage.objects o where not exists (select 1 from storage.buckets b where b.id=o.bucket_id)`]);
  const orphanResults = orphan.map(([n, sql]) => [n, Number(psql(DB, sql))]);
  check("integrity: no orphaned rows in the core chain", orphanResults.every(([, c]) => c === 0), orphanResults.map(([n, c]) => `${n}=${c}`).join(", "));
  report.summary = Object.fromEntries(["public.properties", "public.units", "public.tenants", "public.maintenance_requests", "public.messages", "auth.users", "storage.objects"]
    .map((t) => [t, report.tables[t]?.restoredRows ?? null]));

  report.ok = report.checks.every((c) => c.pass);
} catch (e) {
  check("restore-verify ran to completion", false, String(e.message).slice(0, 400));
} finally {
  if (!flags.includes("--keep")) { try { psql("postgres", `drop database if exists ${DB} with (force)`); report.dropped = true; } catch { report.dropped = false; } }
  report.finishedAt = new Date().toISOString();
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(report.ok ? "RESTORE VERIFIED" : "RESTORE VERIFICATION FAILED");
  process.exit(report.ok ? 0 : 1);
}
