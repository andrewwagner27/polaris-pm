-- Fix: acquire_payment_token ignored expires_at, so an expired 'pending' token
-- (status never changed after a timed-out Edge Function) would permanently block
-- a tenant from paying once their payment context changed (new balance, new method).
--
-- The fix expires stale pending tokens for the tenant atomically before the INSERT
-- attempt, so the partial unique index no longer blocks them.

CREATE OR REPLACE FUNCTION public.acquire_payment_token(p_tenant uuid, p_context text)
RETURNS TABLE(token text, context text, is_new boolean)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  WITH expire AS (
    UPDATE payment_idempotency_tokens
    SET status = 'failed'
    WHERE tenant_id = p_tenant AND status = 'pending' AND expires_at <= now()
  ),
  ins AS (
    INSERT INTO payment_idempotency_tokens(tenant_id, context)
    VALUES (p_tenant, p_context)
    ON CONFLICT (tenant_id) WHERE (status = 'pending')
    DO NOTHING
    RETURNING id AS token, context, true AS is_new
  )
  SELECT token, context, is_new FROM ins
  UNION ALL
  SELECT pit.id, pit.context, false
  FROM payment_idempotency_tokens pit
  WHERE pit.tenant_id = p_tenant AND pit.status = 'pending'
    AND NOT EXISTS (SELECT 1 FROM ins)
  LIMIT 1;
$$;
