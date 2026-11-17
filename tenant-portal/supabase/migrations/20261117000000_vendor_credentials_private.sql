-- 20261117000000_vendor_credentials_private.sql
-- Contractor credentials and contact details on maintenance_requests are no longer readable or settable by tenants.
--
-- Found 2026-11-17 (read-only against production): the "authenticated" role had full table SELECT and INSERT on
-- maintenance_requests, and RLS lets a tenant read and insert their OWN tickets. So a tenant could
--   a. read vendor_token + vendor_pin of their own ticket and sign in to the vendor portal as the contractor
--      (accept, quote, mark complete, upload an invoice), and read the contractor's phone/email; and
--   b. INSERT a ticket carrying a token/PIN/expiry of their choosing (or a non-open status, approvals, invoice
--      fields) and then use the vendor portal on it. The existing column-protection trigger covered UPDATE only.
--
-- Fix (smallest change; the vendor portal, /api routes and Edge Functions use the service role and are unaffected):
--   1. Column privileges: "authenticated" may SELECT every column EXCEPT vendor_token, vendor_pin, vendor_phone,
--      vendor_email, work_order_accepted_ip. Landlords use the same database role, so the landlord app reads the
--      link + PIN through landlord_vendor_access() below. (Clients must name their columns: select("*") is refused.)
--   2. BEFORE INSERT trigger: a client that is not management may only create an 'open' ticket with no vendor,
--      scheduling, quote, invoice, approval, cost or AI fields. Management and server-side (service role) inserts are
--      unchanged.
--   3. landlord_vendor_access(request id) → vendor_token, vendor_pin, vendor_token_expires_at; SECURITY DEFINER,
--      landlords only (others get an error), pinned search_path, EXECUTE for authenticated only.
--   Columns added to maintenance_requests later are NOT readable by clients until granted explicitly.
--
-- Rollback:
--   GRANT SELECT ON public.maintenance_requests TO authenticated;
--   DROP TRIGGER IF EXISTS maintenance_requests_guard_insert ON public.maintenance_requests;
--   DROP FUNCTION IF EXISTS public.guard_maintenance_request_insert();
--   DROP FUNCTION IF EXISTS public.landlord_vendor_access(uuid);
--   (and deploy the previous app version, whose screens use select("*")).

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.landlord_vendor_access(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'migration 20261117000000 has already been applied';
  END IF;
  IF to_regprocedure('public.is_landlord()') IS NULL THEN
    RAISE EXCEPTION 'public.is_landlord() is required';
  END IF;
END $$;

-- 1. Column-level SELECT for clients: everything except contractor credentials and contact details.
REVOKE SELECT ON public.maintenance_requests FROM authenticated, anon;
GRANT SELECT (
  id, tenant_id, unit_id, category, title, description, status, priority, photos, resolved_at, created_at, notes,
  vendor_name, scheduled_date, cost, property_name, updated_at, vendor_token_expires_at, availability, scheduled_time,
  entry_instructions, invoice_url, invoice_notes, nte_amount, quote_amount, quote_notes, quote_submitted_at,
  quote_approved_at, quote_approved_by, work_order_accepted_at, work_order_accepted_by, invoice_amount, receipts,
  owner_approval_required, owner_approved_at, billable_to_tenant, is_emergency, ai_generated, ai_intent_summary
) ON public.maintenance_requests TO authenticated;

-- 2. Tenants (any non-management client) can only create a plain open request.
CREATE FUNCTION public.guard_maintenance_request_insert() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') OR public.is_landlord() THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM 'open'
     OR NEW.vendor_name IS NOT NULL OR NEW.vendor_phone IS NOT NULL OR NEW.vendor_email IS NOT NULL
     OR NEW.vendor_token IS NOT NULL OR NEW.vendor_pin IS NOT NULL OR NEW.vendor_token_expires_at IS NOT NULL
     OR NEW.scheduled_date IS NOT NULL OR NEW.scheduled_time IS NOT NULL OR NEW.entry_instructions IS NOT NULL
     OR NEW.cost IS NOT NULL OR NEW.nte_amount IS NOT NULL OR NEW.notes IS NOT NULL OR NEW.resolved_at IS NOT NULL
     OR NEW.quote_amount IS NOT NULL OR NEW.quote_notes IS NOT NULL OR NEW.quote_submitted_at IS NOT NULL
     OR NEW.quote_approved_at IS NOT NULL OR NEW.quote_approved_by IS NOT NULL
     OR NEW.work_order_accepted_at IS NOT NULL OR NEW.work_order_accepted_by IS NOT NULL OR NEW.work_order_accepted_ip IS NOT NULL
     OR NEW.invoice_url IS NOT NULL OR NEW.invoice_notes IS NOT NULL OR NEW.invoice_amount IS NOT NULL OR NEW.receipts IS NOT NULL
     OR NEW.owner_approved_at IS NOT NULL OR COALESCE(NEW.owner_approval_required, false)
     OR COALESCE(NEW.billable_to_tenant, false) OR COALESCE(NEW.is_emergency, false) OR COALESCE(NEW.ai_generated, false)
     OR NEW.ai_intent_summary IS NOT NULL THEN
    RAISE EXCEPTION 'Tenants may only create an open maintenance request' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.guard_maintenance_request_insert() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER maintenance_requests_guard_insert BEFORE INSERT ON public.maintenance_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_maintenance_request_insert();

-- 3. The landlord app's way to show the vendor link and PIN.
CREATE FUNCTION public.landlord_vendor_access(p_request uuid)
RETURNS TABLE (vendor_token text, vendor_pin text, vendor_token_expires_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_landlord() THEN
    RAISE EXCEPTION 'Landlord access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT m.vendor_token::text, m.vendor_pin::text, m.vendor_token_expires_at::timestamptz
    FROM public.maintenance_requests m WHERE m.id = p_request;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.landlord_vendor_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.landlord_vendor_access(uuid) TO authenticated;

COMMIT;
