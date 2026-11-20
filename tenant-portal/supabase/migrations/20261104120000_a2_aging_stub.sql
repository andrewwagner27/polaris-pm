-- a2_aging: intentionally not implemented — aging reports are not on the Modus roadmap.
-- This stub exists so a3_financial_foundation.sql (which defines a3_collections using a2_aging)
-- compiles on a fresh deploy without depending on the full aging subsystem.
-- The stub returns no rows, so a3_collections and any report calling it returns an empty result set
-- rather than a SQL error. Remove this file and a3_collections when aging is built.

CREATE FUNCTION public.a2_aging(
  p_as_of    date,
  p_scope    text,
  p_scope_id uuid
)
RETURNS TABLE (
  tenant_id    uuid,
  tenant_name  text,
  property_name text,
  books_name   text,
  current_cents bigint,
  d30_cents     bigint,
  d60_cents     bigint,
  d90_cents     bigint,
  open_cents    bigint,
  credit_cents  bigint,
  balance_cents bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NULL::uuid, NULL::text, NULL::text, NULL::text,
         NULL::bigint, NULL::bigint, NULL::bigint, NULL::bigint,
         NULL::bigint, NULL::bigint, NULL::bigint
  WHERE false;
$$;

COMMENT ON FUNCTION public.a2_aging(date, text, uuid)
  IS 'Stub — aging not implemented. Returns empty result set.';
