-- ACH payment idempotency: replaces the time-bucket approach in create-payment-intent.
--
-- The 10-minute time bucket Math.floor(Date.now() / 600_000) in the old idempotency key
-- means two requests straddling a bucket boundary compute different keys and both create
-- separate Stripe payment intents, potentially charging the tenant twice.
--
-- This table gives each in-flight payment attempt a durable DB-generated token that is
-- stable regardless of when the request arrives. Only one 'pending' token per tenant is
-- allowed at a time (partial unique index). A new attempt is only possible once the
-- previous token is committed (success) or failed (error), or after 48 hours.
--
-- acquire_payment_token(tenant, context) is the atomic entry point:
--   • First caller: inserts a new token, returns it with is_new=true.
--   • Retry with same context: returns the existing token with is_new=false → Stripe deduplicates.
--   • Different context (different payment method or different ledger state):
--     returns the existing token with is_new=false AND context ≠ p_context → caller returns 409.
--
-- create-payment-intent marks the token 'committed' on success and 'failed' on Stripe error,
-- so a user who hits a Stripe error can retry and get a fresh token and a new Stripe key.
-- On unrecoverable DB-after-Stripe failure (503 response) the token stays 'pending' until
-- it expires, preventing a retry that might double-charge.

CREATE TABLE public.payment_idempotency_tokens (
  id          text        NOT NULL DEFAULT 'payrent:' || gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  context     text        NOT NULL,
  status      text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','committed','failed')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT now() + interval '48 hours',
  PRIMARY KEY (id)
);

-- Exactly one pending token per tenant.
CREATE UNIQUE INDEX payment_idempotency_tokens_tenant_pending
  ON public.payment_idempotency_tokens(tenant_id)
  WHERE (status = 'pending');

ALTER TABLE public.payment_idempotency_tokens ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.payment_idempotency_tokens TO service_role;

-- Atomically claim or retrieve the in-flight token for this tenant.
CREATE FUNCTION public.acquire_payment_token(p_tenant uuid, p_context text)
RETURNS TABLE(token text, context text, is_new boolean)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  WITH ins AS (
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

-- SECURITY DEFINER means the function runs as its owner regardless of caller role.
-- Without an explicit REVOKE, PostgreSQL grants EXECUTE to PUBLIC by default, so any
-- authenticated user could call acquire_payment_token with an arbitrary tenant_id and
-- block that tenant's payments for 48 hours. Revoke first, then re-grant to service_role only.
REVOKE ALL ON FUNCTION public.acquire_payment_token(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.acquire_payment_token(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_payment_token(uuid, text) TO service_role;

COMMENT ON TABLE public.payment_idempotency_tokens
  IS 'One in-flight ACH payment slot per tenant. Prevents duplicate charges from boundary-straddling concurrent requests.';
