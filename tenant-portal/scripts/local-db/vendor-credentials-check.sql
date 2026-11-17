-- scripts/local-db/vendor-credentials-check.sql
-- Verifies migration 20261117000000 on a LOCAL restore of a production backup (never production). Run with psql as a
-- superuser AFTER applying the migration: psql -X -d <local db> -v tenant_uid=<uuid> -v tenant_id=<uuid> \
--   -v landlord_uid=<uuid> -v other_ticket=<uuid of a ticket with a vendor link> -f vendor-credentials-check.sql
-- Prints PASS/FAIL lines; changes nothing (every block rolls back).
\set ON_ERROR_STOP on
\set cols 'id, tenant_id, unit_id, category, title, description, status, priority, photos, resolved_at, created_at, notes, vendor_name, scheduled_date, cost, property_name, updated_at, vendor_token_expires_at, availability, scheduled_time, entry_instructions, invoice_url, invoice_notes, nte_amount, quote_amount, quote_notes, quote_submitted_at, quote_approved_at, quote_approved_by, work_order_accepted_at, work_order_accepted_by, invoice_amount, receipts, owner_approval_required, owner_approved_at, billable_to_tenant, is_emergency, ai_generated, ai_intent_summary'

-- ── As the tenant ──
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'tenant_uid', 'role', 'authenticated')::text, true) \gset _set_
set local role authenticated;
do $$ begin perform * from public.maintenance_requests; raise notice 'FAIL tenant: select * allowed';
  exception when insufficient_privilege then raise notice 'PASS tenant: select * refused'; end $$;
do $$ begin perform vendor_token from public.maintenance_requests; raise notice 'FAIL tenant: vendor_token readable';
  exception when insufficient_privilege then raise notice 'PASS tenant: vendor_token not readable'; end $$;
do $$ begin perform vendor_pin from public.maintenance_requests; raise notice 'FAIL tenant: vendor_pin readable';
  exception when insufficient_privilege then raise notice 'PASS tenant: vendor_pin not readable'; end $$;
do $$ begin perform vendor_phone, vendor_email from public.maintenance_requests; raise notice 'FAIL tenant: contractor contacts readable';
  exception when insufficient_privilege then raise notice 'PASS tenant: contractor phone/email not readable'; end $$;
do $$ begin perform 1 from public.landlord_vendor_access((select id from public.maintenance_requests limit 1)); raise notice 'FAIL tenant: landlord_vendor_access allowed';
  exception when insufficient_privilege then raise notice 'PASS tenant: landlord_vendor_access refused'; end $$;
select case when count(*) > 0 and count(*) = count(*) filter (where tenant_id = :'tenant_id')
  then 'PASS tenant: app column list works, own tickets only (' || count(*) || ')' else 'FAIL tenant: column list / isolation' end
  from (select :cols from public.maintenance_requests) t;

rollback;

begin;
select set_config('request.jwt.claims', json_build_object('sub', :'tenant_uid', 'role', 'authenticated')::text, true) \gset _set_
select set_config('app.tid', :'tenant_id', true) \gset _set_
set local role authenticated;
do $$ begin
  insert into public.maintenance_requests (tenant_id, title, status, priority) values (current_setting('app.tid')::uuid, 'plain request', 'open', 'normal');
  raise notice 'PASS tenant: plain open request can be created';
exception when others then raise notice 'FAIL tenant: plain insert refused: %', sqlerrm; end $$;
do $$ begin
  insert into public.maintenance_requests (tenant_id, title, status, vendor_token, vendor_pin, vendor_token_expires_at)
    values (current_setting('app.tid')::uuid, 'forged', 'open', 'tok-forged', '1234', now() + interval '1 day');
  raise notice 'FAIL tenant: inserted a ticket with vendor credentials';
exception when insufficient_privilege then raise notice 'PASS tenant: insert with vendor credentials refused'; end $$;
do $$ begin
  insert into public.maintenance_requests (tenant_id, title, status) values (current_setting('app.tid')::uuid, 'forged', 'in_progress');
  raise notice 'FAIL tenant: inserted a non-open ticket';
exception when insufficient_privilege then raise notice 'PASS tenant: insert with non-open status refused'; end $$;
do $$ begin
  insert into public.maintenance_requests (tenant_id, title, status, quote_approved_at, invoice_amount) values (current_setting('app.tid')::uuid, 'forged', 'open', now(), 10);
  raise notice 'FAIL tenant: inserted approval/invoice fields';
exception when insufficient_privilege then raise notice 'PASS tenant: insert with approval/invoice fields refused'; end $$;
do $$ declare n int; begin
  update public.maintenance_requests set vendor_pin = '0000', vendor_token = 'x' where tenant_id = current_setting('app.tid')::uuid and status = 'open';
  get diagnostics n = row_count;
  if n = 0 then raise notice 'PASS tenant: credential update touched no rows (no open tickets)'; else raise notice 'FAIL tenant: updated % rows', n; end if;
exception when insufficient_privilege then raise notice 'PASS tenant: credential update refused'; end $$;
rollback;

-- ── As the landlord ──
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'landlord_uid', 'role', 'authenticated')::text, true) \gset _set_
set local role authenticated;
select 'PASS landlord: app column list reads all tickets (' || count(*) || ')' from (select :cols from public.maintenance_requests) t;
do $$ begin perform vendor_pin from public.maintenance_requests; raise notice 'FAIL landlord: direct vendor_pin select allowed (expected via RPC only)';
  exception when insufficient_privilege then raise notice 'PASS landlord: direct vendor_pin select refused (RPC only)'; end $$;
select case when vendor_token is not null and vendor_pin is not null then 'PASS landlord: landlord_vendor_access returns link + PIN' else 'FAIL landlord: RPC returned nothing' end
  from public.landlord_vendor_access(:'other_ticket');
rollback;

-- ── Server side (service role, as used by the vendor portal API) ──
begin;
set local role service_role;
select case when count(vendor_pin) >= 1 then 'PASS service role: vendor credentials readable (vendor portal unaffected)' else 'FAIL service role' end
  from public.maintenance_requests where vendor_token is not null;
rollback;

-- ── Anonymous ──
begin;
set local role anon;
do $$ begin perform id from public.maintenance_requests; raise notice 'FAIL anon: can read tickets';
  exception when insufficient_privilege then raise notice 'PASS anon: no access'; end $$;
rollback;
