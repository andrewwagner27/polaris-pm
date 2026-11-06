-- ============================================================
-- A2: Receivables — rent charges, tenant ledger, balances, refunds, voids, Stripe fields
-- Requires A1 (20261103000000_a1_ledger_foundation.sql). LOCAL ONLY until approved.
--
--   Part 0  Preconditions (A1 present, A2 absent, required columns)
--   Part 1  Schema: a2_settings, tenant_charges, payment_application_pins,
--           payment_refunds, a2_opening_confirmations; payments void/Stripe columns; 'refund' journal source
--   Part 2  Engine: receipts, applications (same category, oldest first, pins),
--           open charges, tenant balances, tenant ledger, tie-out
--   Part 3  Actions: cutover, charges, schedules, late fees, pins, refunds, voids
--   Part 4  Refund posting to the journal (A1 pattern) + A1 classifier knows voids
--   Part 5  RLS / grants
--   Part 6  Postconditions
--   Part 7  Behaviour checks inside a SAVEPOINT (rolled back)
--
-- ACCOUNTING (owner decisions D1–D10, 2026-11-02):
--   * The journal and Income Statement stay CASH BASIS (A1 rules unchanged). Tenant charges
--     are a receivables sub-ledger and are NEVER posted to the journal.
--   * The tenant ledger counts a receipt only if A1 posts it (a1_classify_payment qualifies),
--     paid on/after the cutover date, deposits excluded. Revenue is therefore recognised once,
--     in the journal; applying it to charges happens only in the sub-ledger.
--   * Application: same category only, oldest due first; excess is a credit in that category;
--     landlord pins (re-application) are honoured first. Deposits never apply.
--   * Rent schedules = recurring_charges (D2), monthly, due on the 1st (D7).
--   * Late fees (D3, D9): $50, assessed on/after the 6th in America/New_York, ONE PER ELIGIBLE RENT CHARGE,
--     when a Rent charge due on/before the 1st is still open. Idempotent, exemptions respected, every
--     decision logged in a2_late_fee_audit; a charged fee flags Eviction Watch as the existing job does.
--     Opening-balance rent gets no automatic fee. Rent covered by a Stripe payment still in flight is deferred;
--     if that payment fails, the next scheduled run (which can be the next day) assesses it.
--   * Channels: a Stripe Pay Rent receipt is always Rent. Late fees are payable offline only for now, so a Stripe
--     receipt can never be categorized as a late fee. A landlord-recorded receipt keeps the category stated.
--   * Refunds: Modus never issues a Stripe refund or reversal. It records what Stripe did, and flags a refund on a
--     destination charge whose transfer reversal is missing or short, based on the original charge's arrangement.
--   * Cutover (D4): one date for all tenants, set by the landlord at activation (never
--     hard-coded); opening balances are explicit, per category, and traceable.
--   * Refunds post a dated refund entry (partial supported); voids reverse via A1.
--   * D8: Stripe's own fee is captured with its balance transaction and payment/refund references, and never
--     posted to owner books (under destination charges it is the platform's cost; Modus's books come later).
--   * D10: original fees and any reversals (Stripe fee, Modus fee, transfer) are captured separately in
--     stripe_fee_events and differences are flagged in a2_stripe_fees. Nothing about them posts; policy is A3's.
-- ============================================================

BEGIN;

-- ============================================================
-- PART 0: Preconditions
-- ============================================================
DO $$
DECLARE v_missing text;
BEGIN
  IF to_regclass('public.journal_entries') IS NULL OR to_regprocedure('public.a1_sync(text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'A2 precondition: A1 ledger is not applied';
  END IF;
  IF to_regclass('public.tenant_charges') IS NOT NULL OR to_regclass('public.a2_settings') IS NOT NULL THEN
    RAISE EXCEPTION 'A2 precondition: already applied';
  END IF;
  SELECT string_agg(t || '.' || c, ', ') INTO v_missing
  FROM (VALUES ('recurring_charges','tenant_id'), ('recurring_charges','category'), ('recurring_charges','amount'),
               ('recurring_charges','start_date'), ('recurring_charges','end_date'),
               ('tenants','unit_id'), ('tenants','user_id'), ('tenants','name'), ('tenants','archived'),
               ('tenants','eviction_watch'), ('tenants','eviction_flagged_at'),
               ('payments','tenant_id'), ('payments','stripe_payment_intent_id'), ('payments','paid_at'), ('payments','source'),
               ('properties','owner_email'), ('landlords','email'), ('landlords','stripe_account_id'), ('landlords','stripe_onboarded')) AS r(t, c)
  WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = r.t AND column_name = r.c);
  IF v_missing IS NOT NULL THEN RAISE EXCEPTION 'A2 precondition: missing columns %', v_missing; END IF;
  SELECT string_agg(c, ', ') INTO v_missing
  FROM unnest(ARRAY['voided_at','voided_by','void_reason','origin','stripe_fee_cents',
                    'stripe_net_cents','stripe_balance_transaction_id','stripe_application_fee_id','stripe_application_fee_cents','stripe_transfer_id','stripe_transfer_cents','stripe_transfer_destination']) c
  WHERE EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = c);
  IF v_missing IS NOT NULL THEN RAISE EXCEPTION 'A2 precondition: payments already has %', v_missing; END IF;
  -- Production's payments already has stripe_charge_id. A2 uses it as it is, and its rollback leaves it in place.
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'stripe_charge_id' AND data_type <> 'text') THEN
    RAISE EXCEPTION 'A2 precondition: payments.stripe_charge_id is not text';
  END IF;
  IF EXISTS (SELECT 1 FROM journal_entries WHERE source_type NOT IN ('payment','expense')) THEN
    RAISE EXCEPTION 'A2 precondition: unexpected journal source types';
  END IF;
END $$;

-- Every payment's A1 classification before A2 (compared in Part 6: the classifier change must not
-- alter any existing payment; it only adds the void rule).
CREATE TEMP TABLE a2_pre_classification ON COMMIT DROP AS
  SELECT p.id, to_jsonb(c) AS c FROM public.payments p CROSS JOIN LATERAL public.a1_classify_payment(p) c;


-- ============================================================
-- PART 1: Schema
-- ============================================================
CREATE TABLE public.a2_settings (
  id              boolean PRIMARY KEY DEFAULT true CHECK (id),
  cutover_date    date,                 -- set by the landlord at activation (D4); NULL = receivables inactive
  cutover_set_by  uuid,
  cutover_set_at  timestamptz
);
INSERT INTO public.a2_settings DEFAULT VALUES;

-- Canonical category key (shared by charges and receipts)
CREATE FUNCTION public.a2_cat(p text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN c IN ('late fee', 'late_fee', 'late fees') THEN 'late fee' ELSE c END
  FROM (SELECT lower(btrim(coalesce(p, ''))) AS c) x;
$$;

CREATE TABLE public.tenant_charges (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  unit_id       uuid REFERENCES public.units(id) ON DELETE SET NULL,
  property_id   uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  category      text NOT NULL CHECK (public.a2_cat(category) IN
                  ('rent','late fee','pet fee','parking','storage','utilities','laundry','other')),
  amount_cents  bigint NOT NULL CHECK (amount_cents <> 0),
  charge_date   date NOT NULL,
  due_date      date NOT NULL,
  period        text CHECK (period ~ '^[0-9]{4}-[0-9]{2}$'),
  source        text NOT NULL CHECK (source IN ('schedule','late_fee','manual','opening_balance')),
  schedule_id   uuid,                 -- recurring_charges.id (kept for traceability; no FK)
  memo          text,
  created_by    uuid DEFAULT auth.uid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  rent_charge_id uuid REFERENCES public.tenant_charges(id) ON DELETE RESTRICT,   -- the rent charge a late fee is for
  voided_at     timestamptz,
  voided_by     uuid,
  void_reason   text,
  CHECK ((source = 'late_fee') = (rent_charge_id IS NOT NULL)),
  CHECK (amount_cents > 0 OR source = 'opening_balance'),          -- only an opening balance may be a credit
  CHECK ((source = 'schedule') = (schedule_id IS NOT NULL)),
  CHECK (source NOT IN ('schedule','late_fee') OR period IS NOT NULL),
  CHECK ((voided_at IS NULL) = (void_reason IS NULL))
);
CREATE UNIQUE INDEX tenant_charges_schedule_period ON public.tenant_charges (schedule_id, period) WHERE source = 'schedule';
-- D9: one fee per rent charge, ever. A voided fee still counts, so voiding is never undone by the next run.
CREATE UNIQUE INDEX tenant_charges_one_fee_per_rent_charge ON public.tenant_charges (rent_charge_id) WHERE source = 'late_fee';
CREATE INDEX tenant_charges_tenant ON public.tenant_charges (tenant_id, due_date);

-- Charges are immutable apart from a one-time void.
CREATE FUNCTION public.a2_charge_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'A2: tenant charges cannot be deleted; void them'; END IF;
  IF OLD.voided_at IS NOT NULL THEN RAISE EXCEPTION 'A2: charge is already void'; END IF;
  IF (to_jsonb(NEW) - 'voided_at' - 'voided_by' - 'void_reason') <> (to_jsonb(OLD) - 'voided_at' - 'voided_by' - 'void_reason') THEN
    RAISE EXCEPTION 'A2: tenant charges are immutable; void and re-enter';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER a2_charge_guard BEFORE UPDATE OR DELETE ON public.tenant_charges
  FOR EACH ROW EXECUTE FUNCTION public.a2_charge_guard();

CREATE TABLE public.payment_application_pins (
  payment_id    uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  charge_id     uuid NOT NULL REFERENCES public.tenant_charges(id) ON DELETE CASCADE,
  amount_cents  bigint NOT NULL CHECK (amount_cents > 0),
  created_by    uuid DEFAULT auth.uid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (payment_id, charge_id)
);

ALTER TABLE public.payments
  ADD COLUMN voided_at                     timestamptz,
  ADD COLUMN voided_by                     uuid,
  ADD COLUMN void_reason                   text,
  ADD COLUMN origin                        text,      -- 'tenant_pay_rent' when created by the tenant Pay Rent workflow
  ADD COLUMN IF NOT EXISTS stripe_charge_id text,
  ADD COLUMN stripe_fee_cents              bigint,    -- Stripe's own fee (platform cost under destination charges, D8)
  ADD COLUMN stripe_net_cents              bigint,
  ADD COLUMN stripe_balance_transaction_id text,
  ADD COLUMN stripe_application_fee_id     text,      -- the Modus fee as Stripe recorded it (D10)
  ADD COLUMN stripe_application_fee_cents  bigint,
  ADD COLUMN stripe_transfer_id            text,      -- the original charge's transfer to the connected account
  ADD COLUMN stripe_transfer_cents         bigint,
  ADD COLUMN stripe_transfer_destination   text;

CREATE TABLE public.payment_refunds (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id        uuid NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
  amount_cents      bigint NOT NULL CHECK (amount_cents > 0),
  refunded_at       timestamptz NOT NULL,          -- actual refund time (Stripe timestamp, or the date entered)
  stripe_refund_id  text UNIQUE,                   -- makes webhook retries idempotent
  reason            text,
  created_by        uuid DEFAULT auth.uid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  reversed_at       timestamptz,                   -- the refund failed at Stripe or was entered in error
  reversed_reason   text,
  CHECK ((reversed_at IS NULL) = (reversed_reason IS NULL))
);

-- Refunds: never deleted, never edited apart from one reversal, never more than the payment, never on a voided payment.
CREATE FUNCTION public.a2_refund_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_gross bigint; v_done bigint; p payments;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'A2: refunds are append-only'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.reversed_at IS NULL OR (to_jsonb(NEW) - 'reversed_at' - 'reversed_reason') <> (to_jsonb(OLD) - 'reversed_at' - 'reversed_reason') THEN
      RAISE EXCEPTION 'A2: refunds are append-only';
    END IF;
    IF OLD.reversed_at IS NOT NULL THEN RETURN NULL; END IF;   -- a repeated failure event changes nothing
    RETURN NEW;
  END IF;
  -- The payment row lock serialises concurrent deliveries, so check for a repeat only after taking it.
  SELECT * INTO p FROM payments WHERE id = NEW.payment_id FOR UPDATE;
  -- Stripe sends several events per refund. BEFORE triggers run ahead of ON CONFLICT, so a refund already
  -- recorded must be skipped here; otherwise a redelivery of a large refund fails the total check below.
  IF NEW.stripe_refund_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM payment_refunds r WHERE r.stripe_refund_id = NEW.stripe_refund_id) THEN
    RETURN NULL;
  END IF;
  IF p.voided_at IS NOT NULL THEN RAISE EXCEPTION 'A2: payment is void'; END IF;
  v_gross := coalesce(p.amount_cents, round(p.amount * 100)::bigint, 0);
  SELECT coalesce(sum(amount_cents), 0) INTO v_done FROM payment_refunds WHERE payment_id = NEW.payment_id AND reversed_at IS NULL;
  IF v_done + NEW.amount_cents > v_gross THEN
    RAISE EXCEPTION 'A2: refunds (%) would exceed the payment (%)', v_done + NEW.amount_cents, v_gross;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER a2_refund_guard BEFORE INSERT OR UPDATE OR DELETE ON public.payment_refunds
  FOR EACH ROW EXECUTE FUNCTION public.a2_refund_guard();

-- D8/D10: what Stripe did with money and fees after the original charge. Append-only, idempotent, and never posted.
CREATE TABLE public.stripe_fee_events (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id              uuid NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
  refund_id               uuid REFERENCES public.payment_refunds(id) ON DELETE RESTRICT,
  kind                    text NOT NULL CHECK (kind IN ('refund_balance_transaction','transfer_reversal','application_fee_refund','refund_failed','refund_rejected')),
  stripe_object_id        text NOT NULL,
  balance_transaction_id  text,
  amount_cents            bigint,
  fee_cents               bigint,
  occurred_at             timestamptz,
  detail                  text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, stripe_object_id)
);
CREATE FUNCTION public.a2_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'A2: % is append-only', TG_TABLE_NAME; END;
$$;
CREATE TRIGGER a2_fee_events_append_only BEFORE UPDATE OR DELETE ON public.stripe_fee_events
  FOR EACH ROW EXECUTE FUNCTION public.a2_append_only();

-- D9: authorized late-fee exemptions. Rent charges due within the dates get no automatic fee.
CREATE TABLE public.a2_late_fee_exemptions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  due_from       date NOT NULL,
  due_through    date,                 -- NULL = until revoked
  reason         text NOT NULL CHECK (btrim(reason) <> ''),
  authorized_by  uuid DEFAULT auth.uid(),
  authorized_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at     timestamptz,
  revoked_by     uuid,
  revoked_reason text,
  CHECK (due_through IS NULL OR due_through >= due_from),
  CHECK ((revoked_at IS NULL) = (revoked_reason IS NULL))
);

-- D9: every decision of every run, including "no fee" decisions. Append-only.
CREATE TABLE public.a2_late_fee_audit (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id          uuid NOT NULL,
  run_at          timestamptz NOT NULL DEFAULT now(),
  as_of           date NOT NULL,
  actor           text NOT NULL,          -- the landlord's id, or 'scheduler'
  tenant_id       uuid NOT NULL,
  rent_charge_id  uuid NOT NULL,
  rent_due_date   date NOT NULL,
  rent_open_cents bigint NOT NULL,
  outcome         text NOT NULL,
  fee_charge_id   uuid,
  exemption_id    uuid
);
CREATE TRIGGER a2_late_fee_audit_append_only BEFORE UPDATE OR DELETE ON public.a2_late_fee_audit
  FOR EACH ROW EXECUTE FUNCTION public.a2_append_only();

-- D9: each run, even one with nothing to decide. Tells the schedule whether this month's full assessment has happened.
CREATE TABLE public.a2_late_fee_runs (
  run_id  uuid PRIMARY KEY,
  run_at  timestamptz NOT NULL DEFAULT now(),
  as_of   date NOT NULL,
  mode    text NOT NULL CHECK (mode IN ('full','deferred_only')),
  actor   text NOT NULL
);
CREATE TRIGGER a2_late_fee_runs_append_only BEFORE UPDATE OR DELETE ON public.a2_late_fee_runs
  FOR EACH ROW EXECUTE FUNCTION public.a2_append_only();

-- D4: every tenant's opening position is explicit. A tenant owing nothing is confirmed at $0 here.
CREATE TABLE public.a2_opening_confirmations (
  tenant_id     uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE RESTRICT,
  confirmed_by  uuid DEFAULT auth.uid(),
  confirmed_at  timestamptz NOT NULL DEFAULT now()
);

-- The journal gains one source type: refunds of posted receipts.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT conrelid::regclass AS tbl, conname FROM pg_constraint
           WHERE conrelid IN ('public.journal_entries'::regclass, 'public.posting_exceptions'::regclass)
             AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%source_type%'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
  END LOOP;
END $$;
ALTER TABLE public.journal_entries    ADD CONSTRAINT journal_entries_source_type_check    CHECK (source_type IN ('payment','expense','refund'));
ALTER TABLE public.posting_exceptions ADD CONSTRAINT posting_exceptions_source_type_check CHECK (source_type IN ('payment','expense','refund'));


-- ============================================================
-- PART 2: Engine (internal; SECURITY DEFINER, not granted to clients)
-- ============================================================
CREATE FUNCTION public.a2_cutover() RETURNS date
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT cutover_date FROM a2_settings;
$$;

-- The calendar date in New York at an instant. Daylight saving is handled by the time zone database.
CREATE FUNCTION public.a2_ny_date(p_at timestamptz) RETURNS date
LANGUAGE sql STABLE AS $$ SELECT (p_at AT TIME ZONE 'America/New_York')::date; $$;

CREATE FUNCTION public.a2_today() RETURNS date
LANGUAGE sql STABLE AS $$ SELECT a2_ny_date(now()); $$;

-- Is a property inside an Income-Statement-style scope?
CREATE FUNCTION public.a2_in_scope(p_property uuid, p_scope text, p_scope_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE coalesce(p_scope, 'portfolio')
    WHEN 'portfolio' THEN true
    WHEN 'property'  THEN p_property = p_scope_id
    WHEN 'books'     THEN (SELECT accounting_entity_id FROM properties WHERE id = p_property) = p_scope_id
    WHEN 'owner'     THEN (SELECT ae.owner_entity_id FROM properties pr JOIN accounting_entities ae ON ae.id = pr.accounting_entity_id
                            WHERE pr.id = p_property) = p_scope_id
    ELSE false END;
$$;

-- Receipts the tenant ledger recognises: exactly those A1 has POSTED (same classifier, and an active
-- journal posting exists — a receipt whose posting failed stays in reconciliation, not in the tenant
-- ledger), on/after cutover, not deposits. Refunds dated on/before p_as_of reduce them.
CREATE FUNCTION public.a2_receipts(p_as_of date)
RETURNS TABLE (payment_id uuid, tenant_id uuid, cat text, paid_on date, created_at timestamptz,
               gross_cents bigint, refunded_cents bigint, net_cents bigint, books uuid, property_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.tenant_id, a2_cat(p.category), c.entry_date, p.created_at, c.amount_cents, rf.cents,
         c.amount_cents - rf.cents, c.books, c.property_id
  FROM payments p
  CROSS JOIN LATERAL a1_classify_payment(p) c
  CROSS JOIN LATERAL (SELECT coalesce(sum(r.amount_cents), 0)::bigint AS cents FROM payment_refunds r
                      WHERE r.payment_id = p.id AND r.reversed_at IS NULL AND (r.refunded_at AT TIME ZONE 'America/New_York')::date <= p_as_of) rf
  WHERE c.qualifies AND c.credit_code <> '2100' AND p.tenant_id IS NOT NULL
    AND a2_cutover() IS NOT NULL AND c.entry_date >= a2_cutover() AND c.entry_date <= p_as_of
    AND EXISTS (SELECT 1 FROM journal_entries je
                WHERE je.source_type = 'payment' AND je.source_id = p.id AND je.kind = 'post'
                  AND (je.signature->>'amount')::bigint = c.amount_cents
                  AND NOT EXISTS (SELECT 1 FROM journal_entries x WHERE x.reverses_entry_id = je.id));
$$;

-- Which charges each receipt / credit pays, as of a date. Same category only; landlord pins first,
-- then oldest due first. Rows with charge_id NULL are unapplied credit.
CREATE FUNCTION public.a2_applications(p_as_of date, p_tenant uuid DEFAULT NULL)
RETURNS TABLE (tenant_id uuid, cat text, charge_id uuid, payment_id uuid, credit_charge_id uuid,
               credit_property_id uuid, amount_cents bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  g record; pin record;
  c_id uuid[]; c_rem bigint[];
  k_pay uuid[]; k_chg uuid[]; k_prop uuid[]; k_rem bigint[];
  i int; j int; a bigint;
BEGIN
  IF a2_cutover() IS NULL THEN RETURN; END IF;
  FOR g IN
    SELECT DISTINCT x.t, x.c FROM (
      SELECT tc.tenant_id t, a2_cat(tc.category) c FROM tenant_charges tc WHERE p_tenant IS NULL OR tc.tenant_id = p_tenant
      UNION SELECT r.tenant_id, r.cat FROM a2_receipts(p_as_of) r WHERE p_tenant IS NULL OR r.tenant_id = p_tenant) x
    ORDER BY 1, 2
  LOOP
    SELECT coalesce(array_agg(tc.id ORDER BY tc.due_date, tc.created_at, tc.id), '{}'),
           coalesce(array_agg(tc.amount_cents ORDER BY tc.due_date, tc.created_at, tc.id), '{}')
      INTO c_id, c_rem
      FROM tenant_charges tc
     WHERE tc.tenant_id = g.t AND a2_cat(tc.category) = g.c AND tc.amount_cents > 0 AND tc.charge_date <= p_as_of
       AND (tc.voided_at IS NULL OR (tc.voided_at AT TIME ZONE 'America/New_York')::date > p_as_of);

    SELECT coalesce(array_agg(s.pid ORDER BY s.d, s.ca, s.k), '{}'), coalesce(array_agg(s.cid ORDER BY s.d, s.ca, s.k), '{}'),
           coalesce(array_agg(s.prop ORDER BY s.d, s.ca, s.k), '{}'), coalesce(array_agg(s.amt ORDER BY s.d, s.ca, s.k), '{}')
      INTO k_pay, k_chg, k_prop, k_rem
      FROM (SELECT r.payment_id pid, NULL::uuid cid, r.property_id prop, r.paid_on d, r.created_at ca, r.payment_id k, r.net_cents amt
              FROM a2_receipts(p_as_of) r WHERE r.tenant_id = g.t AND r.cat = g.c AND r.net_cents > 0
            UNION ALL
            SELECT NULL, tc.id, tc.property_id, tc.due_date, tc.created_at, tc.id, -tc.amount_cents
              FROM tenant_charges tc
             WHERE tc.tenant_id = g.t AND a2_cat(tc.category) = g.c AND tc.amount_cents < 0 AND tc.charge_date <= p_as_of
               AND (tc.voided_at IS NULL OR (tc.voided_at AT TIME ZONE 'America/New_York')::date > p_as_of)) s;

    -- 1. landlord pins (re-application within the category)
    FOR pin IN SELECT pp.payment_id AS pp_pay, pp.charge_id AS pp_chg, pp.amount_cents AS pp_amt
                 FROM payment_application_pins pp
                WHERE pp.payment_id = ANY (k_pay) AND pp.charge_id = ANY (c_id) ORDER BY pp.created_at, pp.charge_id
    LOOP
      i := array_position(c_id, pin.pp_chg); j := array_position(k_pay, pin.pp_pay);
      a := least(pin.pp_amt, c_rem[i], k_rem[j]);
      IF a > 0 THEN
        c_rem[i] := c_rem[i] - a; k_rem[j] := k_rem[j] - a;
        tenant_id := g.t; cat := g.c; charge_id := c_id[i]; payment_id := k_pay[j]; credit_charge_id := NULL;
        credit_property_id := k_prop[j]; amount_cents := a; RETURN NEXT;
      END IF;
    END LOOP;

    -- 2. oldest due first; whatever is left is credit
    FOR j IN 1 .. coalesce(array_length(k_rem, 1), 0) LOOP
      FOR i IN 1 .. coalesce(array_length(c_rem, 1), 0) LOOP
        EXIT WHEN k_rem[j] = 0;
        IF c_rem[i] > 0 THEN
          a := least(c_rem[i], k_rem[j]);
          c_rem[i] := c_rem[i] - a; k_rem[j] := k_rem[j] - a;
          tenant_id := g.t; cat := g.c; charge_id := c_id[i]; payment_id := k_pay[j]; credit_charge_id := k_chg[j];
          credit_property_id := k_prop[j]; amount_cents := a; RETURN NEXT;
        END IF;
      END LOOP;
      IF k_rem[j] > 0 THEN
        tenant_id := g.t; cat := g.c; charge_id := NULL; payment_id := k_pay[j]; credit_charge_id := k_chg[j];
        credit_property_id := k_prop[j]; amount_cents := k_rem[j]; RETURN NEXT;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

-- Every non-void charge with what has been applied and what is still open, as of a date.
CREATE FUNCTION public.a2_open_charges_internal(p_as_of date, p_tenant uuid DEFAULT NULL)
RETURNS TABLE (charge_id uuid, tenant_id uuid, cat text, category text, source text, period text,
               charge_date date, due_date date, amount_cents bigint, applied_cents bigint, open_cents bigint,
               days_past_due int, property_id uuid, unit_id uuid, memo text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH app AS (SELECT a.charge_id, sum(a.amount_cents)::bigint s FROM a2_applications(p_as_of, p_tenant) a
               WHERE a.charge_id IS NOT NULL GROUP BY 1)
  SELECT tc.id, tc.tenant_id, a2_cat(tc.category), tc.category, tc.source, tc.period, tc.charge_date, tc.due_date,
         tc.amount_cents, coalesce(app.s, 0), tc.amount_cents - coalesce(app.s, 0),
         (p_as_of - tc.due_date),
         tc.property_id, tc.unit_id, tc.memo
  FROM tenant_charges tc LEFT JOIN app ON app.charge_id = tc.id
  WHERE a2_cutover() IS NOT NULL AND (p_tenant IS NULL OR tc.tenant_id = p_tenant)
    AND tc.amount_cents > 0 AND tc.charge_date <= p_as_of
    AND (tc.voided_at IS NULL OR (tc.voided_at AT TIME ZONE 'America/New_York')::date > p_as_of);
$$;

-- Caller may see this tenant: the landlord, or the tenant's own login.
CREATE FUNCTION public.a2_can_see_tenant(p_tenant uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT is_landlord() OR EXISTS (SELECT 1 FROM tenants t WHERE t.id = p_tenant AND t.user_id = auth.uid());
$$;


-- ============================================================
-- PART 2b: Read API (granted to authenticated; access checked inside)
-- ============================================================
CREATE FUNCTION public.a2_status() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('cutover_date', s.cutover_date, 'active', s.cutover_date IS NOT NULL,
                            'set_at', CASE WHEN is_landlord() THEN s.cutover_set_at END,
                            'charges', CASE WHEN is_landlord() THEN (SELECT count(*) FROM tenant_charges) END)
  FROM a2_settings s;
$$;

CREATE FUNCTION public.a2_open_charges(p_tenant uuid, p_as_of date DEFAULT NULL)
RETURNS TABLE (charge_id uuid, category text, source text, period text, due_date date, amount_cents bigint,
               applied_cents bigint, open_cents bigint, days_past_due int, memo text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.charge_id, o.category, o.source, o.period, o.due_date, o.amount_cents, o.applied_cents, o.open_cents,
         o.days_past_due, o.memo
  FROM a2_open_charges_internal(coalesce(p_as_of, a2_today()), p_tenant) o
  WHERE p_tenant IS NOT NULL AND a2_can_see_tenant(p_tenant)
  ORDER BY o.due_date, o.charge_id;
$$;

-- Tenant ledger: charges, receipts, refunds and voids in date order with a running balance.
-- p_tenant NULL = the caller's own tenant record.
CREATE FUNCTION public.a2_tenant_ledger(p_tenant uuid DEFAULT NULL)
RETURNS TABLE (seq bigint, event_date date, kind text, category text, description text,
               charge_cents bigint, payment_cents bigint, balance_cents bigint, ref_id uuid, status text, open_cents bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE v_t uuid := p_tenant; v_today date := a2_today();
BEGIN
  IF v_t IS NULL THEN SELECT t.id INTO v_t FROM tenants t WHERE t.user_id = auth.uid() ORDER BY t.created_at DESC NULLS LAST LIMIT 1; END IF;
  IF v_t IS NULL OR a2_cutover() IS NULL OR NOT a2_can_see_tenant(v_t) THEN RETURN; END IF;
  RETURN QUERY
  WITH oc AS (SELECT * FROM a2_open_charges_internal(v_today, v_t)),
  ev AS (
    SELECT tc.charge_date d, 1 o, tc.created_at ca,
           CASE tc.source WHEN 'opening_balance' THEN 'opening' WHEN 'late_fee' THEN 'late_fee' ELSE 'charge' END k,
           tc.category cg,
           concat_ws(' · ', CASE tc.source WHEN 'opening_balance' THEN 'Opening balance' WHEN 'schedule' THEN tc.category || ' ' || tc.period
                                           WHEN 'late_fee' THEN 'Late fee' ELSE tc.category END, tc.memo,
                     CASE WHEN tc.voided_at IS NOT NULL THEN 'VOID: ' || tc.void_reason END) ds,
           CASE WHEN tc.voided_at IS NULL AND tc.amount_cents > 0 THEN tc.amount_cents ELSE 0 END ch,
           CASE WHEN tc.voided_at IS NULL AND tc.amount_cents < 0 THEN -tc.amount_cents ELSE 0 END py,
           tc.id rid,
           CASE WHEN tc.voided_at IS NOT NULL THEN 'void' WHEN tc.amount_cents < 0 THEN 'credit'
                WHEN oc.open_cents = 0 THEN 'paid' WHEN oc.applied_cents > 0 THEN 'partly paid'
                WHEN oc.due_date > v_today THEN 'not yet due' ELSE 'open' END st,
           CASE WHEN tc.voided_at IS NULL AND tc.amount_cents > 0 THEN oc.open_cents END op
    FROM tenant_charges tc LEFT JOIN oc ON oc.charge_id = tc.id
    WHERE tc.tenant_id = v_t AND tc.charge_date <= v_today
    UNION ALL
    SELECT r.paid_on, 2, r.created_at, 'payment', p.category,
           concat_ws(' · ', 'Payment', p.category,
                     CASE WHEN p.origin = 'tenant_pay_rent' THEN 'Stripe Pay Rent'
                          WHEN p.stripe_payment_intent_id IS NOT NULL THEN 'Stripe'
                          ELSE concat_ws(' ', 'Recorded offline', '(' || nullif(p.source, '') || ')') END), 0, r.gross_cents, r.payment_id, 'received', NULL
    FROM a2_receipts(v_today) r JOIN payments p ON p.id = r.payment_id WHERE r.tenant_id = v_t
    UNION ALL
    SELECT (rf.refunded_at AT TIME ZONE 'America/New_York')::date, 3, rf.created_at, 'refund', p.category,
           concat_ws(' · ', 'Refund', rf.reason, 'REVERSED: ' || rf.reversed_reason),
           CASE WHEN rf.reversed_at IS NULL THEN rf.amount_cents ELSE 0 END, 0, rf.id,
           CASE WHEN rf.reversed_at IS NULL THEN 'refunded' ELSE 'void' END, NULL
    FROM payment_refunds rf JOIN a2_receipts(v_today) r ON r.payment_id = rf.payment_id JOIN payments p ON p.id = rf.payment_id
    WHERE r.tenant_id = v_t AND (rf.refunded_at AT TIME ZONE 'America/New_York')::date <= v_today
    UNION ALL
    SELECT (p.paid_at AT TIME ZONE 'America/New_York')::date, 2, p.created_at, 'void_payment', p.category,
           concat_ws(' · ', 'Payment', p.category, 'VOID: ' || p.void_reason), 0::bigint, 0::bigint, p.id, 'void', NULL::bigint
    FROM payments p
    WHERE p.tenant_id = v_t AND p.voided_at IS NOT NULL AND p.paid_at IS NOT NULL
      AND (p.paid_at AT TIME ZONE 'America/New_York')::date BETWEEN a2_cutover() AND v_today
  )
  SELECT row_number() OVER w, ev.d, ev.k, ev.cg, ev.ds, ev.ch, ev.py,
         sum(ev.ch - ev.py) OVER (ORDER BY ev.d, ev.o, ev.ca, ev.rid ROWS UNBOUNDED PRECEDING)::bigint,
         ev.rid, ev.st, ev.op
  FROM ev WINDOW w AS (ORDER BY ev.d, ev.o, ev.ca, ev.rid)
  ORDER BY ev.d, ev.o, ev.ca, ev.rid;
END;
$$;

-- Balance per tenant (landlord): open charges, credits and the difference.
CREATE FUNCTION public.a2_tenant_balances(p_as_of date DEFAULT NULL, p_scope text DEFAULT 'portfolio', p_scope_id uuid DEFAULT NULL)
RETURNS TABLE (tenant_id uuid, tenant_name text, property_name text, books_name text,
               open_cents bigint, credit_cents bigint, balance_cents bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH d AS (SELECT coalesce(p_as_of, a2_today()) AS as_of),
  oc AS (SELECT o.* FROM d, a2_open_charges_internal(d.as_of, NULL) o
         WHERE o.open_cents > 0 AND a2_in_scope(o.property_id, p_scope, p_scope_id)),
  cr AS (SELECT a.tenant_id, sum(a.amount_cents)::bigint s FROM d, a2_applications(d.as_of, NULL) a
         WHERE a.charge_id IS NULL AND a2_in_scope(a.credit_property_id, p_scope, p_scope_id) GROUP BY 1),
  t AS (SELECT oc.tenant_id FROM oc UNION SELECT cr.tenant_id FROM cr)
  SELECT t.tenant_id, tn.name, pr.name, ae.name,
         coalesce(sum(oc.open_cents), 0)::bigint,
         coalesce(max(cr.s), 0)::bigint,
         (coalesce(sum(oc.open_cents), 0) - coalesce(max(cr.s), 0))::bigint
  FROM t
  JOIN tenants tn ON tn.id = t.tenant_id
  LEFT JOIN units u ON u.id = tn.unit_id
  LEFT JOIN properties pr ON pr.id = u.property_id
  LEFT JOIN accounting_entities ae ON ae.id = pr.accounting_entity_id
  LEFT JOIN oc ON oc.tenant_id = t.tenant_id
  LEFT JOIN cr ON cr.tenant_id = t.tenant_id
  WHERE is_landlord()
  GROUP BY t.tenant_id, tn.name, pr.name, ae.name
  ORDER BY tn.name;
$$;

-- One tenant's open charges in scope, with days past due.
CREATE FUNCTION public.a2_tenant_open_charges(p_tenant uuid, p_as_of date DEFAULT NULL, p_scope text DEFAULT 'portfolio', p_scope_id uuid DEFAULT NULL)
RETURNS TABLE (charge_id uuid, category text, period text, due_date date, days_past_due int,
               amount_cents bigint, applied_cents bigint, open_cents bigint, property_name text, memo text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.charge_id, o.category, o.period, o.due_date, o.days_past_due, o.amount_cents, o.applied_cents,
         o.open_cents, pr.name, o.memo
  FROM a2_open_charges_internal(coalesce(p_as_of, a2_today()), p_tenant) o
  LEFT JOIN properties pr ON pr.id = o.property_id
  WHERE is_landlord() AND o.open_cents > 0 AND a2_in_scope(o.property_id, p_scope, p_scope_id)
  ORDER BY o.due_date, o.charge_id;
$$;

-- What Pay Rent may collect, from the tenant's ledger and nothing else. Open charges are already net of payments and credits.
--   Payable = open Rent due by today, less Stripe rent still settling (same 14-day window as the late-fee deferral).
--   Other categories are listed, never added: a Stripe Pay Rent payment is always Rent, and each charge keeps its own category.
--   Credit waiting for a later month doesn't reduce today's amount: the engine applies it when that month's charge exists.
-- Internal: the payment function calls this with the service role. Tenants read it through a2_pay_rent_due.
CREATE FUNCTION public.a2_pay_rent_internal(p_tenant uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_today date := a2_today(); v_first date := date_trunc('month', a2_today())::date;
        v_lines jsonb; v_other jsonb; v_open bigint; v_past bigint; v_pending bigint; v_applied bigint; v_waiting bigint; v_route boolean;
BEGIN
  IF a2_cutover() IS NULL THEN RETURN jsonb_build_object('ledger_active', false); END IF;
  -- The same route create-payment-intent requires: tenant → unit → property → owner_email → an onboarded landlord.
  SELECT EXISTS (SELECT 1 FROM tenants t JOIN units u ON u.id = t.unit_id JOIN properties pr ON pr.id = u.property_id
                 JOIN landlords l ON l.email = pr.owner_email
                 WHERE t.id = p_tenant AND l.stripe_onboarded AND l.stripe_account_id IS NOT NULL) INTO v_route;
  SELECT coalesce(jsonb_agg(jsonb_build_object('charge_id', o.charge_id, 'category', o.category, 'period', o.period, 'due_date', o.due_date, 'memo', o.memo,
                    'amount_cents', o.amount_cents, 'open_cents', o.open_cents, 'past_due', o.due_date < v_first) ORDER BY o.due_date, o.charge_id) FILTER (WHERE o.cat = 'rent'), '[]'::jsonb),
         coalesce(sum(o.open_cents) FILTER (WHERE o.cat = 'rent'), 0)::bigint,
         coalesce(sum(o.open_cents) FILTER (WHERE o.cat = 'rent' AND o.due_date < v_first), 0)::bigint
    INTO v_lines, v_open, v_past
    FROM a2_open_charges_internal(v_today, p_tenant) o
    WHERE o.open_cents > 0 AND o.due_date <= v_today;
  SELECT coalesce(jsonb_agg(jsonb_build_object('category', x.category, 'open_cents', x.open_cents, 'past_due', x.past_due) ORDER BY x.category), '[]'::jsonb) INTO v_other
    FROM (SELECT min(o.category) AS category, sum(o.open_cents)::bigint AS open_cents, bool_or(o.due_date < v_first) AS past_due
          FROM a2_open_charges_internal(v_today, p_tenant) o
          WHERE o.open_cents > 0 AND o.due_date <= v_today AND o.cat <> 'rent' GROUP BY o.cat) x;
  SELECT coalesce(sum(coalesce(py.amount_cents, round(py.amount * 100)::bigint)), 0)::bigint INTO v_pending
    FROM payments py
    WHERE py.tenant_id = p_tenant AND coalesce(a2_cat(py.category), 'rent') = 'rent' AND lower(coalesce(py.status, '')) = 'pending'
      AND py.voided_at IS NULL AND py.stripe_payment_intent_id IS NOT NULL
      AND a2_ny_date(py.created_at) BETWEEN v_today - 14 AND v_today;
  SELECT coalesce(sum(a.amount_cents), 0)::bigint INTO v_applied
    FROM a2_applications(v_today, p_tenant) a
    JOIN tenant_charges ch ON ch.id = a.charge_id
    WHERE a.credit_charge_id IS NOT NULL AND ch.due_date >= v_first AND ch.due_date <= v_today;
  SELECT coalesce(sum(a.amount_cents), 0)::bigint INTO v_waiting
    FROM a2_applications(v_today, p_tenant) a
    WHERE a.charge_id IS NULL AND a.cat = 'rent';
  RETURN jsonb_build_object('ledger_active', true, 'online_available', v_route, 'open_rent_cents', v_open, 'past_due_cents', v_past, 'pending_cents', v_pending,
                            'payable_cents', greatest(v_open - v_pending, 0), 'rent_lines', v_lines, 'other_lines', v_other,
                            'credit_applied_cents', v_applied, 'credit_waiting_cents', v_waiting);
END;
$$;

-- Properties whose tenants can't pay online, and why (landlord). Online rent needs the property's owner_email to be
-- an onboarded landlord's email, exactly as create-payment-intent checks it.
CREATE FUNCTION public.a2_payment_route_gaps()
RETURNS TABLE (property_id uuid, property_name text, owner_email text, problem text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pr.id, pr.name, pr.owner_email,
         CASE WHEN nullif(btrim(pr.owner_email), '') IS NULL THEN 'no_owner_email'
              WHEN NOT EXISTS (SELECT 1 FROM landlords l WHERE l.email = pr.owner_email) THEN 'no_matching_owner'
              ELSE 'owner_not_onboarded' END
  FROM properties pr
  WHERE is_landlord()
    AND NOT EXISTS (SELECT 1 FROM landlords l WHERE l.email = pr.owner_email AND l.stripe_onboarded AND l.stripe_account_id IS NOT NULL)
  ORDER BY pr.name, pr.id;
$$;

-- The same figures for the Pay Rent screen. p_tenant NULL = the caller's own record.
CREATE FUNCTION public.a2_pay_rent_due(p_tenant uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_t uuid := p_tenant;
BEGIN
  IF v_t IS NULL THEN SELECT t.id INTO v_t FROM tenants t WHERE t.user_id = auth.uid() ORDER BY t.created_at DESC NULLS LAST LIMIT 1; END IF;
  IF v_t IS NULL OR NOT a2_can_see_tenant(v_t) THEN RAISE EXCEPTION 'A2: not authorized for this tenant'; END IF;
  RETURN a2_pay_rent_internal(v_t);
END;
$$;

-- Tie-out: for every receipt the tenant ledger recognises, the journal's net income for that
-- receipt (posting + its refunds) equals the tenant ledger's net receipt. Charges never post.
CREATE FUNCTION public.a2_tie_out()
RETURNS TABLE (books_name text, category text, receipts int, ledger_cents bigint, journal_cents bigint,
               charges_in_journal int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH r AS (SELECT * FROM a2_receipts(DATE '9999-12-31')),
  j AS (
    SELECT r.payment_id, coalesce(sum(CASE WHEN a.type = 'income' THEN l.credit_cents - l.debit_cents ELSE 0 END), 0)::bigint inc
    FROM r
    LEFT JOIN journal_entries je ON (je.source_type = 'payment' AND je.source_id = r.payment_id)
                                 OR (je.source_type = 'refund' AND je.source_id IN (SELECT id FROM payment_refunds WHERE payment_id = r.payment_id))
    LEFT JOIN journal_lines l ON l.journal_entry_id = je.id
    LEFT JOIN gl_accounts a ON a.id = l.account_id
    GROUP BY r.payment_id)
  SELECT ae.name, initcap(r.cat), count(*)::int, sum(r.net_cents)::bigint, sum(j.inc)::bigint,
         (SELECT count(*) FROM journal_entries je WHERE je.source_id IN (SELECT id FROM tenant_charges))::int
  FROM r JOIN j USING (payment_id) JOIN accounting_entities ae ON ae.id = r.books
  WHERE is_landlord()
  GROUP BY ae.name, r.cat ORDER BY 1, 2;
$$;


-- D4: each tenant's opening position, for the cutover checklist.
CREATE FUNCTION public.a2_opening_status()
RETURNS TABLE (tenant_id uuid, tenant_name text, property_name text, entries int, opening_cents bigint,
               confirmed_zero boolean, confirmed_at timestamptz, is_explicit boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, t.name, pr.name, coalesce(o.n, 0)::int, coalesce(o.s, 0)::bigint, c.tenant_id IS NOT NULL, c.confirmed_at,
         coalesce(o.n, 0) > 0 OR c.tenant_id IS NOT NULL
  FROM tenants t
  LEFT JOIN units u ON u.id = t.unit_id
  LEFT JOIN properties pr ON pr.id = u.property_id
  LEFT JOIN a2_opening_confirmations c ON c.tenant_id = t.id
  LEFT JOIN LATERAL (SELECT count(*) n, sum(tc.amount_cents) s FROM tenant_charges tc
                     WHERE tc.tenant_id = t.id AND tc.source = 'opening_balance' AND tc.voided_at IS NULL) o ON true
  WHERE is_landlord() AND NOT coalesce(t.archived, false)
  ORDER BY t.name;
$$;

-- D4: every opening balance entry with who entered it and when.
CREATE FUNCTION public.a2_opening_entries()
RETURNS TABLE (charge_id uuid, tenant_name text, category text, amount_cents bigint, due_date date, memo text,
               entered_at timestamptz, entered_by text, voided_at timestamptz, void_reason text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tc.id, t.name, tc.category, tc.amount_cents, tc.due_date, tc.memo, tc.created_at,
         coalesce(to_jsonb(pf) ->> 'full_name', to_jsonb(pf) ->> 'name', to_jsonb(pf) ->> 'email', tc.created_by::text),
         tc.voided_at, tc.void_reason
  FROM tenant_charges tc
  JOIN tenants t ON t.id = tc.tenant_id
  LEFT JOIN profiles pf ON pf.id = tc.created_by
  WHERE is_landlord() AND tc.source = 'opening_balance'
  ORDER BY t.name, tc.due_date, tc.created_at;
$$;

-- D4: legacy charge rows in payments, for review. Read only; nothing is converted automatically.
CREATE FUNCTION public.a2_legacy_charge_rows()
RETURNS TABLE (payment_id uuid, tenant_id uuid, tenant_name text, category text, status text, due_date date,
               amount_cents bigint, balance_cents bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.tenant_id, t.name, p.category, p.status, p.due_date,
         coalesce(p.amount_cents, round(p.amount * 100)::bigint),
         round(p.balance_due * 100)::bigint
  FROM payments p LEFT JOIN tenants t ON t.id = p.tenant_id
  WHERE is_landlord() AND p.voided_at IS NULL AND (p.due_date IS NOT NULL OR p.balance_due IS NOT NULL)
  ORDER BY t.name, p.due_date;
$$;

-- Reconciliation: posted receipts since the cutover that are in the journal but cannot be in the
-- tenant ledger (no tenant recorded). Cash-basis income includes them; no tenant balance reflects them.
CREATE FUNCTION public.a2_unlinked_receipts()
RETURNS TABLE (payment_id uuid, books_name text, category text, paid_on date, amount_cents bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, ae.name, p.category, c.entry_date, c.amount_cents
  FROM payments p
  CROSS JOIN LATERAL a1_classify_payment(p) c
  JOIN accounting_entities ae ON ae.id = c.books
  WHERE is_landlord() AND a2_cutover() IS NOT NULL AND c.qualifies AND c.credit_code <> '2100'
    AND p.tenant_id IS NULL AND c.entry_date >= a2_cutover()
  ORDER BY c.entry_date;
$$;

-- Each Stripe refund against the ORIGINAL charge's arrangement. A transfer reversal is expected only when the charge
-- actually transferred funds to a connected account, and then in proportion to that transfer (Stripe's own rule).
CREATE FUNCTION public.a2_refund_transfer_lines(p_payment uuid DEFAULT NULL)
RETURNS TABLE (refund_id uuid, payment_id uuid, stripe_refund_id text, refunded_on date, amount_cents bigint, arrangement text,
               expected_reversal_cents bigint, transfer_reversed_cents bigint, stripe_fee_returned_cents bigint,
               balance_transaction text, transfer_status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT f.id, f.payment_id, f.stripe_refund_id, (f.refunded_at AT TIME ZONE 'America/New_York')::date, f.amount_cents, a.arr,
         CASE WHEN a.arr = 'destination' THEN round(f.amount_cents * coalesce(p.stripe_transfer_cents, g.gross)::numeric / nullif(g.gross, 0))::bigint END,
         e.reversed, e.fee_back, e.bt,
         CASE WHEN a.arr = 'platform_only' THEN 'not_required'
              WHEN e.details = 0 THEN 'details_missing'
              WHEN a.arr = 'unconfirmed' THEN CASE WHEN e.reversed > 0 THEN 'reversed' ELSE 'unconfirmed' END
              WHEN e.reversed = 0 THEN 'missing'
              WHEN e.reversed < round(f.amount_cents * coalesce(p.stripe_transfer_cents, g.gross)::numeric / nullif(g.gross, 0))::bigint - 1 THEN 'short'
              ELSE 'reversed' END
  FROM payment_refunds f
  JOIN payments p ON p.id = f.payment_id
  CROSS JOIN LATERAL (SELECT coalesce(p.amount_cents, round(p.amount * 100)::bigint) AS gross) g
  CROSS JOIN LATERAL (SELECT CASE WHEN p.stripe_transfer_destination IS NOT NULL OR p.stripe_transfer_id IS NOT NULL THEN 'destination'
                                  WHEN to_jsonb(p) ->> 'owner_stripe_account' IS NOT NULL THEN 'unconfirmed'
                                  ELSE 'platform_only' END AS arr) a
  CROSS JOIN LATERAL (SELECT coalesce(sum(x.amount_cents) FILTER (WHERE x.kind = 'transfer_reversal'), 0)::bigint reversed,
                             coalesce(sum(abs(x.fee_cents)) FILTER (WHERE x.kind = 'refund_balance_transaction'), 0)::bigint fee_back,
                             max(x.balance_transaction_id) FILTER (WHERE x.kind = 'refund_balance_transaction') bt,
                             count(*) FILTER (WHERE x.kind = 'refund_balance_transaction') details
                      FROM stripe_fee_events x WHERE x.refund_id = f.id) e
  WHERE f.stripe_refund_id IS NOT NULL AND f.reversed_at IS NULL AND (p_payment IS NULL OR f.payment_id = p_payment);
$$;

CREATE FUNCTION public.a2_stripe_refunds()
RETURNS TABLE (refund_id uuid, payment_id uuid, stripe_refund_id text, refunded_on date, amount_cents bigint, arrangement text,
               expected_reversal_cents bigint, transfer_reversed_cents bigint, stripe_fee_returned_cents bigint,
               balance_transaction text, transfer_status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM a2_refund_transfer_lines(NULL) WHERE is_landlord() ORDER BY refunded_on, stripe_refund_id;
$$;

-- D8/D10 reconciliation: each Stripe receipt, the original fees, any reversals, and flags for what differs.
CREATE FUNCTION public.a2_stripe_fees()
RETURNS TABLE (payment_id uuid, tenant_name text, paid_on date, gross_cents bigint, platform_fee_cents bigint,
               stripe_application_fee_cents bigint, application_fee_refunded_cents bigint,
               stripe_fee_cents bigint, stripe_fee_reversed_cents bigint, stripe_net_cents bigint, balance_transaction text,
               stripe_charge_id text, refunded_cents bigint, transfer_reversed_cents bigint, transfer_cents bigint, transfer_destination text, flags text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, t.name, (p.paid_at AT TIME ZONE 'America/New_York')::date,
         coalesce(p.amount_cents, round(p.amount * 100)::bigint), coalesce(p.platform_fee_cents, 0)::bigint,
         p.stripe_application_fee_cents, e.fee_refunded, p.stripe_fee_cents, e.stripe_reversed, p.stripe_net_cents,
         p.stripe_balance_transaction_id, p.stripe_charge_id, r.refunded, e.transfer_reversed, p.stripe_transfer_cents, p.stripe_transfer_destination,
         array_remove(ARRAY[
           CASE WHEN p.stripe_fee_cents IS NULL THEN 'stripe_fee_not_captured' END,
           CASE WHEN coalesce(p.platform_fee_cents, 0) > 0 AND p.stripe_application_fee_cents IS NULL THEN 'platform_fee_not_confirmed' END,
           CASE WHEN p.stripe_application_fee_cents IS NOT NULL AND p.stripe_application_fee_cents <> coalesce(p.platform_fee_cents, 0) THEN 'platform_fee_differs' END,
           CASE WHEN e.fee_refunded > 0 THEN 'platform_fee_refunded' END,
           CASE WHEN e.stripe_reversed > 0 THEN 'stripe_fee_reversed' END,
           CASE WHEN tl.missing > 0 THEN 'transfer_reversal_missing' END,
           CASE WHEN tl.short > 0 THEN 'transfer_reversal_short' END,
           CASE WHEN tl.unconfirmed > 0 THEN 'transfer_arrangement_unconfirmed' END,
           CASE WHEN r.refunded > 0 AND r.without_details > 0 THEN 'refund_details_missing' END,
           CASE WHEN e.failed > 0 THEN 'refund_failed' END,
           CASE WHEN e.rejected > 0 THEN 'refund_rejected' END
         ], NULL)
  FROM payments p
  LEFT JOIN tenants t ON t.id = p.tenant_id
  CROSS JOIN LATERAL (SELECT coalesce(sum(x.amount_cents) FILTER (WHERE x.kind = 'application_fee_refund'), 0)::bigint fee_refunded,
                             coalesce(sum(abs(x.fee_cents)) FILTER (WHERE x.kind = 'refund_balance_transaction'), 0)::bigint stripe_reversed,
                             coalesce(sum(x.amount_cents) FILTER (WHERE x.kind = 'transfer_reversal'), 0)::bigint transfer_reversed,
                             count(*) FILTER (WHERE x.kind = 'refund_failed') failed,
                             count(*) FILTER (WHERE x.kind = 'refund_rejected') rejected
                      FROM stripe_fee_events x WHERE x.payment_id = p.id) e
  CROSS JOIN LATERAL (SELECT coalesce(sum(f.amount_cents), 0)::bigint refunded,
                             count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM stripe_fee_events x
                                                                WHERE x.refund_id = f.id AND x.kind = 'refund_balance_transaction')) without_details
                      FROM payment_refunds f WHERE f.payment_id = p.id AND f.reversed_at IS NULL) r
  CROSS JOIN LATERAL (SELECT count(*) FILTER (WHERE l.transfer_status = 'missing') missing,
                             count(*) FILTER (WHERE l.transfer_status = 'short') short,
                             count(*) FILTER (WHERE l.transfer_status = 'unconfirmed') unconfirmed
                      FROM a2_refund_transfer_lines(p.id) l) tl
  WHERE is_landlord() AND p.stripe_payment_intent_id IS NOT NULL AND lower(coalesce(p.status, '')) = 'paid' AND p.voided_at IS NULL
  ORDER BY p.paid_at DESC;
$$;

-- Three-way reconciliation by category: journal income = tenant-ledger receipts = applied to charges + unapplied credit.
CREATE FUNCTION public.a2_category_reconciliation(p_tenant uuid DEFAULT NULL, p_as_of date DEFAULT NULL)
RETURNS TABLE (books_name text, category text, account_code text, receipts int, journal_cents bigint,
               ledger_cents bigint, applied_cents bigint, credit_cents bigint, in_balance boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH d AS (SELECT coalesce(p_as_of, a2_today()) AS as_of),
  r AS (SELECT x.* FROM d, a2_receipts(d.as_of) x WHERE p_tenant IS NULL OR x.tenant_id = p_tenant),
  a AS (SELECT y.payment_id, coalesce(sum(y.amount_cents) FILTER (WHERE y.charge_id IS NOT NULL), 0)::bigint applied,
               coalesce(sum(y.amount_cents) FILTER (WHERE y.charge_id IS NULL), 0)::bigint credit
        FROM d, a2_applications(d.as_of, p_tenant) y WHERE y.payment_id IS NOT NULL GROUP BY 1),
  j AS (SELECT r.payment_id, coalesce(sum(CASE WHEN ga.type = 'income' THEN l.credit_cents - l.debit_cents ELSE 0 END), 0)::bigint inc
        FROM r CROSS JOIN d
        LEFT JOIN journal_entries je ON je.entry_date <= d.as_of
          AND ((je.source_type = 'payment' AND je.source_id = r.payment_id)
            OR (je.source_type = 'refund' AND je.source_id IN (SELECT f.id FROM payment_refunds f WHERE f.payment_id = r.payment_id)))
        LEFT JOIN journal_lines l ON l.journal_entry_id = je.id
        LEFT JOIN gl_accounts ga ON ga.id = l.account_id
        GROUP BY r.payment_id)
  SELECT ae.name, initcap(r.cat), (a1_payment_account(r.cat)).code, count(*)::int, sum(j.inc)::bigint, sum(r.net_cents)::bigint,
         sum(coalesce(a.applied, 0))::bigint, sum(coalesce(a.credit, 0))::bigint,
         sum(j.inc) = sum(r.net_cents) AND sum(r.net_cents) = sum(coalesce(a.applied, 0)) + sum(coalesce(a.credit, 0))
  FROM r JOIN j USING (payment_id) LEFT JOIN a USING (payment_id) JOIN accounting_entities ae ON ae.id = r.books
  WHERE a2_can_see_tenant(coalesce(p_tenant, gen_random_uuid())) OR is_landlord()
  GROUP BY ae.name, r.cat ORDER BY 1, 2;
$$;

-- Where one payment went. Applications are calculated from the receipts, charges and landlord re-applications.
CREATE FUNCTION public.a2_payment_applications(p_payment uuid)
RETURNS TABLE (applied_to text, category text, period text, due_date date, amount_cents bigint, charge_id uuid, re_applied boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN x.charge_id IS NULL THEN 'Credit on account' ELSE coalesce(tc.memo, tc.category || ' ' || tc.period, tc.category || ' charge') END,
         coalesce(tc.category, initcap(x.cat)), tc.period, tc.due_date, x.amount_cents, x.charge_id,
         EXISTS (SELECT 1 FROM payment_application_pins pp WHERE pp.payment_id = x.payment_id AND pp.charge_id = x.charge_id)
  FROM payments p
  CROSS JOIN LATERAL a2_applications(a2_today(), p.tenant_id) x
  LEFT JOIN tenant_charges tc ON tc.id = x.charge_id
  WHERE p.id = p_payment AND x.payment_id = p_payment AND a2_can_see_tenant(p.tenant_id)
  ORDER BY tc.due_date NULLS LAST;
$$;

-- D9: the audit trail, newest first.
CREATE FUNCTION public.a2_late_fee_log(p_limit int DEFAULT 50)
RETURNS TABLE (run_id uuid, run_at timestamptz, as_of date, actor text, tenant_name text, rent_due_date date,
               rent_open_cents bigint, outcome text, fee_charge_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.run_id, l.run_at, l.as_of, l.actor, t.name, l.rent_due_date, l.rent_open_cents, l.outcome, l.fee_charge_id
  FROM a2_late_fee_audit l LEFT JOIN tenants t ON t.id = l.tenant_id
  WHERE is_landlord() ORDER BY l.id DESC LIMIT least(coalesce(p_limit, 50), 500);
$$;


-- ============================================================
-- PART 3: Actions (landlord; generation and late fees also service role)
-- ============================================================
-- The scheduler (service role): the same claim Supabase's auth.role() reads, or the active SQL role.
CREATE FUNCTION public.a2_is_service() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
      OR current_setting('role', true) = 'service_role';
$$;

CREATE FUNCTION public.a2_require_landlord() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN IF NOT is_landlord() THEN RAISE EXCEPTION 'A2: landlord only' USING ERRCODE = '42501'; END IF; END;
$$;

CREATE FUNCTION public.a2_require_active() RETURNS date
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v date := a2_cutover();
BEGIN IF v IS NULL THEN RAISE EXCEPTION 'A2: receivables are not active (no cutover date set)'; END IF; RETURN v; END;
$$;

-- D4: one cutover date, chosen at activation. Cannot change once any charge exists.
CREATE FUNCTION public.a2_set_cutover(p_date date) RETURNS date
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM a2_require_landlord();
  IF p_date IS NULL THEN RAISE EXCEPTION 'A2: cutover date required'; END IF;
  IF EXISTS (SELECT 1 FROM tenant_charges) THEN RAISE EXCEPTION 'A2: cutover cannot change after charges exist'; END IF;
  UPDATE a2_settings SET cutover_date = p_date, cutover_set_by = auth.uid(), cutover_set_at = now();
  RETURN p_date;
END;
$$;

-- One-time charge or opening balance (explicit, traceable: who, when, memo).
CREATE FUNCTION public.a2_add_charge(p_tenant uuid, p_category text, p_amount_cents bigint, p_due_date date,
                                     p_memo text DEFAULT NULL, p_opening boolean DEFAULT false) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cut date; v_unit uuid; v_prop uuid; v_id uuid;
BEGIN
  PERFORM a2_require_landlord();
  v_cut := a2_require_active();
  SELECT t.unit_id, u.property_id INTO v_unit, v_prop FROM tenants t LEFT JOIN units u ON u.id = t.unit_id WHERE t.id = p_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'A2: tenant not found'; END IF;
  IF p_due_date IS NULL THEN RAISE EXCEPTION 'A2: due date required'; END IF;
  IF p_opening THEN
    IF p_amount_cents IS NULL OR p_amount_cents = 0 THEN RAISE EXCEPTION 'A2: opening balance must be non-zero'; END IF;
    IF p_due_date > v_cut THEN RAISE EXCEPTION 'A2: an opening balance must be due on or before the cutover date (%)', v_cut; END IF;
    IF coalesce(btrim(p_memo), '') = '' THEN RAISE EXCEPTION 'A2: opening balance needs a note (what it is for)'; END IF;
  ELSE
    IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN RAISE EXCEPTION 'A2: amount must be greater than zero'; END IF;
    IF p_due_date < v_cut THEN RAISE EXCEPTION 'A2: charges before the cutover belong in the opening balance'; END IF;
  END IF;
  INSERT INTO tenant_charges (tenant_id, unit_id, property_id, category, amount_cents, charge_date, due_date, source, memo)
  VALUES (p_tenant, v_unit, v_prop, p_category, p_amount_cents, CASE WHEN p_opening THEN v_cut ELSE p_due_date END,
          p_due_date, CASE WHEN p_opening THEN 'opening_balance' ELSE 'manual' END, nullif(btrim(p_memo), ''))
  RETURNING id INTO v_id;
  IF p_opening THEN DELETE FROM a2_opening_confirmations WHERE tenant_id = p_tenant; END IF;
  RETURN v_id;
END;
$$;

-- D4: the landlord states this tenant owed nothing at the cutover.
CREATE FUNCTION public.a2_confirm_zero_opening(p_tenant uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM a2_require_landlord();
  PERFORM a2_require_active();
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = p_tenant) THEN RAISE EXCEPTION 'A2: tenant not found'; END IF;
  IF EXISTS (SELECT 1 FROM tenant_charges WHERE tenant_id = p_tenant AND source = 'opening_balance' AND voided_at IS NULL) THEN
    RAISE EXCEPTION 'A2: this tenant already has an opening balance entered; void it first';
  END IF;
  INSERT INTO a2_opening_confirmations (tenant_id) VALUES (p_tenant) ON CONFLICT (tenant_id) DO NOTHING;
END;
$$;

CREATE FUNCTION public.a2_void_charge(p_charge uuid, p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM a2_require_landlord();
  IF coalesce(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A2: a reason is required to void a charge'; END IF;
  UPDATE tenant_charges SET voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason) WHERE id = p_charge;
  IF NOT FOUND THEN RAISE EXCEPTION 'A2: charge not found'; END IF;
END;
$$;

-- Monthly charges from recurring_charges (D2), due on the 1st (D7), from the cutover onward.
-- Idempotent: UNIQUE (schedule_id, period). A schedule that starts mid-month first bills the next 1st.
CREATE FUNCTION public.a2_generate_charges(p_as_of date DEFAULT NULL)
RETURNS TABLE (schedule_id uuid, tenant_id uuid, period text, outcome text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE v_cut date; v_as_of date := coalesce(p_as_of, a2_today()); rc record; v_p date; v_last date;
        v_unit uuid; v_prop uuid; v_arch boolean; v_freq text; v_n int;
BEGIN
  IF NOT (is_landlord() OR a2_is_service()) THEN RAISE EXCEPTION 'A2: not allowed' USING ERRCODE = '42501'; END IF;
  v_cut := a2_require_active();
  FOR rc IN SELECT r.*, to_jsonb(r) AS j FROM recurring_charges r ORDER BY r.tenant_id, r.id LOOP
    schedule_id := rc.id; tenant_id := rc.tenant_id; period := NULL;
    v_freq := lower(coalesce(rc.j->>'frequency', 'monthly'));
    SELECT t.unit_id, u.property_id, coalesce(t.archived, false) INTO v_unit, v_prop, v_arch
      FROM tenants t LEFT JOIN units u ON u.id = t.unit_id WHERE t.id = rc.tenant_id;
    IF v_freq <> 'monthly' THEN outcome := 'skipped: frequency ' || v_freq; RETURN NEXT; CONTINUE; END IF;
    IF lower(coalesce(rc.j->>'active', 'true')) = 'false' OR lower(coalesce(rc.j->>'status', 'active')) <> 'active' THEN
      outcome := 'skipped: schedule inactive'; RETURN NEXT; CONTINUE; END IF;
    IF a2_cat(rc.category) NOT IN ('rent','late fee','pet fee','parking','storage','utilities','laundry','other') THEN
      outcome := 'skipped: category not billable (' || coalesce(rc.category, 'none') || ')'; RETURN NEXT; CONTINUE; END IF;
    IF coalesce(rc.amount, 0) <= 0 THEN outcome := 'skipped: amount missing'; RETURN NEXT; CONTINUE; END IF;
    IF v_arch THEN outcome := 'skipped: tenant archived'; RETURN NEXT; CONTINUE; END IF;
    IF v_unit IS NULL THEN outcome := 'skipped: tenant has no unit'; RETURN NEXT; CONTINUE; END IF;
    -- first 1st on/after max(cutover, start_date)
    v_p := greatest(v_cut, coalesce(rc.start_date, v_cut));
    IF extract(day FROM v_p) <> 1 THEN v_p := (date_trunc('month', v_p) + interval '1 month')::date; END IF;
    v_last := least(v_as_of, coalesce(rc.end_date, v_as_of));
    v_n := 0;
    WHILE v_p <= v_last LOOP
      period := to_char(v_p, 'YYYY-MM');
      INSERT INTO tenant_charges (tenant_id, unit_id, property_id, category, amount_cents, charge_date, due_date, period, source, schedule_id, created_by)
      VALUES (rc.tenant_id, v_unit, v_prop, rc.category, round(rc.amount * 100)::bigint, v_p, v_p, period, 'schedule', rc.id, auth.uid())
      ON CONFLICT DO NOTHING;
      outcome := CASE WHEN FOUND THEN 'created' ELSE 'exists' END; RETURN NEXT;
      v_n := v_n + 1;
      v_p := (v_p + interval '1 month')::date;
    END LOOP;
    IF v_n = 0 THEN period := NULL; outcome := 'nothing due yet'; RETURN NEXT; END IF;
  END LOOP;
END;
$$;

-- D3 + D9: the assessment itself. Takes the date so tests can exercise any month; clients can't call it.
--   Eligible: a non-void Rent charge, due on or before the 1st of the month, still open on the as-of date,
--             on or after the 6th in New York, for a tenant who isn't archived.
--   One fee per rent charge: enforced by a unique index, so repeats and concurrent runs can't duplicate.
--   Not charged, each logged: opening-balance rent (its history was entered by hand), a charge already
--   assessed (even if that fee was voided), an authorized exemption, and rent covered by a Stripe payment
--   started in the last 14 days that hasn't settled (deferred to the next run, not waived).
--   p_deferred_only: consider only charges whose latest decision was a deferral. Used by the later scheduled runs,
--   so a failed payment is assessed promptly while the rest of the month's policy stays "assessed on the 6th".
CREATE FUNCTION public.a2_assess_late_fees_at(p_as_of date, p_deferred_only boolean DEFAULT false)
RETURNS TABLE (tenant_id uuid, tenant_name text, rent_charge_id uuid, rent_due_date date, rent_open_cents bigint, outcome text, fee_charge_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE v_first date; v_period text; r record; v_run uuid := gen_random_uuid();
        v_actor text := coalesce(auth.uid()::text, 'scheduler'); v_exempt uuid; v_fee uuid; v_pending bigint := 0; v_tenant uuid;
        c_fee constant bigint := 5000;   -- $50 (D3: unchanged)
BEGIN
  PERFORM a2_require_active();
  IF p_as_of IS NULL OR extract(day FROM p_as_of) < 6 THEN
    RAISE EXCEPTION 'A2: late fees are assessed on or after the 6th of the month (existing policy)';
  END IF;
  v_first := date_trunc('month', p_as_of)::date; v_period := to_char(p_as_of, 'YYYY-MM');
  INSERT INTO a2_late_fee_runs (run_id, as_of, mode, actor) VALUES (v_run, p_as_of, CASE WHEN p_deferred_only THEN 'deferred_only' ELSE 'full' END, v_actor);

  -- A deferred charge that is no longer open (the payment settled, or the charge was voided) closes out, with no fee.
  FOR r IN
    SELECT DISTINCT ON (l.rent_charge_id) l.rent_charge_id cid, l.tenant_id t, tn.name nm, l.rent_due_date due, l.outcome o
    FROM a2_late_fee_audit l JOIN tenants tn ON tn.id = l.tenant_id
    ORDER BY l.rent_charge_id, l.id DESC
  LOOP
    CONTINUE WHEN r.o NOT LIKE 'deferred:%';
    CONTINUE WHEN EXISTS (SELECT 1 FROM a2_open_charges_internal(p_as_of, r.t) o WHERE o.charge_id = r.cid AND o.open_cents > 0);
    tenant_id := r.t; tenant_name := r.nm; rent_charge_id := r.cid; rent_due_date := r.due; rent_open_cents := 0; fee_charge_id := NULL;
    outcome := 'deferral closed: no longer open';
    INSERT INTO a2_late_fee_audit (run_id, as_of, actor, tenant_id, rent_charge_id, rent_due_date, rent_open_cents, outcome)
    VALUES (v_run, p_as_of, v_actor, r.t, r.cid, r.due, 0, outcome);
    RETURN NEXT;
  END LOOP;

  FOR r IN
    SELECT o.charge_id cid, o.tenant_id t, tn.name nm, tn.unit_id u, un.property_id p, o.source src, o.due_date due, o.open_cents open_c
    FROM a2_open_charges_internal(p_as_of, NULL) o
    JOIN tenants tn ON tn.id = o.tenant_id LEFT JOIN units un ON un.id = tn.unit_id
    WHERE o.cat = 'rent' AND o.due_date <= v_first AND o.open_cents > 0 AND NOT coalesce(tn.archived, false)
      AND (NOT p_deferred_only OR (SELECT l.outcome FROM a2_late_fee_audit l WHERE l.rent_charge_id = o.charge_id ORDER BY l.id DESC LIMIT 1) LIKE 'deferred:%')
    ORDER BY tn.name, o.tenant_id, o.due_date, o.charge_id
  LOOP
    tenant_id := r.t; tenant_name := r.nm; rent_charge_id := r.cid; rent_due_date := r.due; rent_open_cents := r.open_c; fee_charge_id := NULL;
    v_exempt := NULL;
    IF v_tenant IS DISTINCT FROM r.t THEN   -- rent still settling for this tenant, used oldest charge first
      v_tenant := r.t;
      SELECT coalesce(sum(coalesce(py.amount_cents, round(py.amount * 100)::bigint)), 0) INTO v_pending
      FROM payments py
      WHERE py.tenant_id = r.t AND a2_cat(py.category) = 'rent' AND lower(coalesce(py.status, '')) = 'pending'
        AND py.voided_at IS NULL AND py.stripe_payment_intent_id IS NOT NULL
        AND a2_ny_date(py.created_at) BETWEEN p_as_of - 14 AND p_as_of;
    END IF;

    SELECT tc.id INTO v_fee FROM tenant_charges tc WHERE tc.source = 'late_fee' AND tc.rent_charge_id = r.cid;
    IF v_fee IS NOT NULL THEN
      outcome := 'already charged'; fee_charge_id := v_fee;
    ELSIF r.src = 'opening_balance' THEN
      outcome := 'not eligible: opening balance';
    ELSE
      SELECT e.id INTO v_exempt FROM a2_late_fee_exemptions e
      WHERE e.tenant_id = r.t AND e.revoked_at IS NULL AND r.due >= e.due_from AND (e.due_through IS NULL OR r.due <= e.due_through)
      ORDER BY e.authorized_at LIMIT 1;
      IF v_exempt IS NOT NULL THEN
        outcome := 'exempt';
      ELSIF v_pending >= r.open_c THEN
        v_pending := v_pending - r.open_c;
        outcome := 'deferred: payment in progress';
      ELSE
        INSERT INTO tenant_charges (tenant_id, unit_id, property_id, category, amount_cents, charge_date, due_date, period, source, rent_charge_id, memo, created_by)
        VALUES (r.t, r.u, r.p, 'Late Fee', c_fee, p_as_of, p_as_of, v_period, 'late_fee', r.cid, 'Rent due ' || to_char(r.due, 'YYYY-MM-DD') || ' unpaid', auth.uid())
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_fee;
        IF v_fee IS NOT NULL THEN
          UPDATE tenants SET eviction_watch = true, eviction_flagged_at = now() WHERE id = r.t;
          outcome := 'late fee charged'; fee_charge_id := v_fee;
        ELSE
          outcome := 'already charged';   -- lost a race with another run; the unique index held
        END IF;
      END IF;
    END IF;
    INSERT INTO a2_late_fee_audit (run_id, as_of, actor, tenant_id, rent_charge_id, rent_due_date, rent_open_cents, outcome, fee_charge_id, exemption_id)
    VALUES (v_run, p_as_of, v_actor, r.t, r.cid, r.due, r.open_c, outcome, fee_charge_id, v_exempt);
    RETURN NEXT;
  END LOOP;
END;
$$;

-- The schedule: the month's first run is the full assessment (normally the 6th; a later day if that run was missed).
-- Every later run handles deferrals only, so a charge that reopens mid-month isn't fined until next month's assessment.
CREATE FUNCTION public.a2_assess_scheduled_at(p_as_of date)
RETURNS TABLE (tenant_id uuid, tenant_name text, rent_charge_id uuid, rent_due_date date, rent_open_cents bigint, outcome text, fee_charge_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_full_done boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM a2_late_fee_runs x WHERE x.mode = 'full' AND date_trunc('month', x.as_of) = date_trunc('month', p_as_of)) INTO v_full_done;
  RETURN QUERY SELECT * FROM a2_assess_late_fees_at(p_as_of, v_full_done);
END;
$$;

-- The landlord button (always a full run) and the scheduler. Always today's date in New York; the caller can't choose it.
CREATE FUNCTION public.a2_assess_late_fees()
RETURNS TABLE (tenant_id uuid, tenant_name text, rent_charge_id uuid, rent_due_date date, rent_open_cents bigint, outcome text, fee_charge_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (is_landlord() OR a2_is_service()) THEN RAISE EXCEPTION 'A2: not allowed' USING ERRCODE = '42501'; END IF;
  IF a2_is_service() THEN RETURN QUERY SELECT * FROM a2_assess_scheduled_at(a2_today());
  ELSE RETURN QUERY SELECT * FROM a2_assess_late_fees_at(a2_today(), false);
  END IF;
END;
$$;

-- D9: authorized exemptions. Who and when are recorded; revoking keeps the record.
CREATE FUNCTION public.a2_grant_late_fee_exemption(p_tenant uuid, p_due_from date, p_due_through date, p_reason text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM a2_require_landlord();
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = p_tenant) THEN RAISE EXCEPTION 'A2: tenant not found'; END IF;
  IF p_due_from IS NULL THEN RAISE EXCEPTION 'A2: enter the first rent due date the exemption covers'; END IF;
  IF p_due_through IS NOT NULL AND p_due_through < p_due_from THEN RAISE EXCEPTION 'A2: the exemption ends before it starts'; END IF;
  IF coalesce(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A2: a reason is required for an exemption'; END IF;
  INSERT INTO a2_late_fee_exemptions (tenant_id, due_from, due_through, reason) VALUES (p_tenant, p_due_from, p_due_through, btrim(p_reason))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE FUNCTION public.a2_revoke_late_fee_exemption(p_id uuid, p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM a2_require_landlord();
  IF coalesce(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A2: a reason is required to revoke an exemption'; END IF;
  UPDATE a2_late_fee_exemptions SET revoked_at = now(), revoked_by = auth.uid(), revoked_reason = btrim(p_reason)
  WHERE id = p_id AND revoked_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'A2: exemption not found or already revoked'; END IF;
END;
$$;

-- D5: landlord re-application within the same category.
CREATE FUNCTION public.a2_pin_application(p_payment uuid, p_charge uuid, p_amount_cents bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pt uuid; v_pc text; v_ct uuid; v_cc text; v_amt bigint; v_void timestamptz;
BEGIN
  PERFORM a2_require_landlord();
  SELECT p.tenant_id, a2_cat(p.category) INTO v_pt, v_pc FROM payments p WHERE p.id = p_payment;
  SELECT tc.tenant_id, a2_cat(tc.category), tc.amount_cents, tc.voided_at INTO v_ct, v_cc, v_amt, v_void FROM tenant_charges tc WHERE tc.id = p_charge;
  IF v_pt IS NULL OR v_ct IS NULL THEN RAISE EXCEPTION 'A2: payment or charge not found'; END IF;
  IF v_pt <> v_ct THEN RAISE EXCEPTION 'A2: payment and charge belong to different tenants'; END IF;
  IF v_pc <> v_cc THEN RAISE EXCEPTION 'A2: a % payment can only be applied to % charges (reclassify the payment instead)', v_pc, v_pc; END IF;
  IF v_void IS NOT NULL OR v_amt <= 0 THEN RAISE EXCEPTION 'A2: charge is void or a credit'; END IF;
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN RAISE EXCEPTION 'A2: amount must be greater than zero'; END IF;
  IF NOT EXISTS (SELECT 1 FROM a2_receipts(DATE '9999-12-31') r WHERE r.payment_id = p_payment AND r.net_cents > 0) THEN
    RAISE EXCEPTION 'A2: this payment has nothing left to apply (void, fully refunded, or not in the ledger)';
  END IF;
  INSERT INTO payment_application_pins (payment_id, charge_id, amount_cents) VALUES (p_payment, p_charge, p_amount_cents)
  ON CONFLICT (payment_id, charge_id) DO UPDATE SET amount_cents = EXCLUDED.amount_cents, created_by = auth.uid(), created_at = now();
END;
$$;

CREATE FUNCTION public.a2_unpin_application(p_payment uuid, p_charge uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM a2_require_landlord();
  DELETE FROM payment_application_pins WHERE payment_id = p_payment AND charge_id = p_charge;
END;
$$;

-- Manual (non-Stripe) refund, dated by the landlord. Stripe refunds arrive from the webhook.
CREATE FUNCTION public.a2_record_refund(p_payment uuid, p_amount_cents bigint, p_refunded_on date, p_reason text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; p payments; c record;
BEGIN
  PERFORM a2_require_landlord();
  SELECT * INTO p FROM payments WHERE id = p_payment;
  IF NOT FOUND THEN RAISE EXCEPTION 'A2: payment not found'; END IF;
  IF p.stripe_payment_intent_id IS NOT NULL THEN RAISE EXCEPTION 'A2: refund Stripe payments in Stripe; the webhook records them'; END IF;
  SELECT * INTO c FROM a1_classify_payment(p);
  IF NOT coalesce(c.qualifies, false) THEN
    RAISE EXCEPTION 'A2: only a received payment in the ledger can be refunded (%)', coalesce(c.err, c.excluded_reason, 'unknown');
  END IF;
  IF p_refunded_on IS NULL THEN RAISE EXCEPTION 'A2: enter the date the refund was paid'; END IF;
  IF p_refunded_on < c.entry_date THEN RAISE EXCEPTION 'A2: a refund cannot be dated before the payment (%)', c.entry_date; END IF;
  IF EXISTS (SELECT 1 FROM payment_refunds f WHERE f.payment_id = p_payment AND f.reversed_at IS NULL AND f.amount_cents = p_amount_cents
             AND f.reason = btrim(p_reason) AND (f.refunded_at AT TIME ZONE 'America/New_York')::date = p_refunded_on) THEN
    RAISE EXCEPTION 'A2: this refund is already recorded. If it is a second refund, give it its own reason';
  END IF;
  IF coalesce(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A2: a reason is required'; END IF;
  INSERT INTO payment_refunds (payment_id, amount_cents, refunded_at, reason)
  VALUES (p_payment, p_amount_cents, (p_refunded_on + time '12:00') AT TIME ZONE 'America/New_York', btrim(p_reason))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Correct a manual refund entered in error. The row stays; its journal entry is reversed.
CREATE FUNCTION public.a2_reverse_refund(p_refund uuid, p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r payment_refunds;
BEGIN
  PERFORM a2_require_landlord();
  SELECT * INTO r FROM payment_refunds WHERE id = p_refund;
  IF NOT FOUND THEN RAISE EXCEPTION 'A2: refund not found'; END IF;
  IF r.stripe_refund_id IS NOT NULL THEN RAISE EXCEPTION 'A2: Stripe refunds can only change at Stripe'; END IF;
  IF r.reversed_at IS NOT NULL THEN RAISE EXCEPTION 'A2: refund is already reversed'; END IF;
  IF coalesce(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A2: a reason is required to reverse a refund'; END IF;
  UPDATE payment_refunds SET reversed_at = now(), reversed_reason = btrim(p_reason) WHERE id = p_refund;
END;
$$;

-- Void a manual payment entered in error. The row is kept; A1 reverses its posting.
CREATE FUNCTION public.a2_void_payment(p_payment uuid, p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p payments;
BEGIN
  PERFORM a2_require_landlord();
  SELECT * INTO p FROM payments WHERE id = p_payment;
  IF NOT FOUND THEN RAISE EXCEPTION 'A2: payment not found'; END IF;
  IF p.stripe_payment_intent_id IS NOT NULL THEN RAISE EXCEPTION 'A2: Stripe payments are refunded, not voided'; END IF;
  IF p.voided_at IS NOT NULL THEN RAISE EXCEPTION 'A2: payment is already void'; END IF;
  IF coalesce(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A2: a reason is required to void a payment'; END IF;
  UPDATE payments SET voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason) WHERE id = p_payment;
END;
$$;


-- ============================================================
-- PART 4: Journal — A1 classifier learns voids; refunds post (A1 pattern)
-- ============================================================
-- Identical to A1's classifier except the void line (a voided payment no longer qualifies).
CREATE OR REPLACE FUNCTION public.a1_classify_payment(p payments,
  OUT qualifies boolean, OUT excluded_reason text, OUT err text, OUT warnings text[],
  OUT amount_cents bigint, OUT fee_cents bigint, OUT entry_date date, OUT books uuid,
  OUT property_id uuid, OUT unit_id uuid, OUT debit_code text, OUT credit_code text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE m record; v_unit uuid; v_dollars bigint;
BEGIN
  qualifies := false; warnings := '{}';
  IF p.id IS NULL THEN excluded_reason := 'deleted'; RETURN; END IF;
  IF p.voided_at IS NOT NULL THEN excluded_reason := 'void'; RETURN; END IF;   -- A2
  IF lower(coalesce(p.status, '')) <> 'paid' THEN excluded_reason := 'status:' || coalesce(p.status, 'null'); RETURN; END IF;
  IF p.due_date IS NOT NULL OR p.balance_due IS NOT NULL THEN
    err := 'charge_row_marked_paid'; RETURN;   -- a charge, not a receipt: never guessed
  END IF;

  v_dollars := CASE WHEN p.amount IS NULL THEN NULL ELSE round(p.amount * 100)::bigint END;
  IF p.amount_cents IS NOT NULL AND v_dollars IS NOT NULL AND p.amount_cents <> v_dollars THEN
    err := 'ambiguous_amount'; RETURN;
  END IF;
  amount_cents := coalesce(p.amount_cents, v_dollars);
  IF amount_cents IS NULL OR amount_cents <= 0 THEN err := 'missing_or_nonpositive_amount'; RETURN; END IF;

  SELECT * INTO m FROM a1_payment_account(p.category);
  IF m.err IS NOT NULL THEN err := m.err; RETURN; END IF;
  credit_code := m.code;
  IF m.warn IS NOT NULL THEN warnings := warnings || m.warn; END IF;

  v_unit := p.unit_id;   -- the unit recorded on the receipt; never inferred from where the tenant lives now
  IF v_unit IS NULL THEN err := 'no_unit'; RETURN; END IF;
  unit_id := v_unit;
  SELECT u.property_id, pr.accounting_entity_id INTO property_id, books
  FROM units u LEFT JOIN properties pr ON pr.id = u.property_id WHERE u.id = v_unit;
  IF property_id IS NULL THEN err := 'no_property'; RETURN; END IF;
  IF books IS NULL THEN err := 'property_without_books'; RETURN; END IF;

  IF p.paid_at IS NULL THEN err := 'missing_paid_date'; RETURN; END IF;   -- never substitute the recorded date
  entry_date := (p.paid_at AT TIME ZONE 'America/New_York')::date;
  debit_code := CASE WHEN p.stripe_payment_intent_id IS NOT NULL THEN '1050' ELSE '1000' END;
  fee_cents := CASE WHEN p.stripe_payment_intent_id IS NOT NULL THEN greatest(coalesce(p.platform_fee_cents, 0), 0) ELSE 0 END;
  qualifies := true;
END;
$$;

-- Reconciliation shows refund exceptions with their own amount and description (A1 knew only payment/expense).
CREATE OR REPLACE FUNCTION public.a1_open_exceptions()
RETURNS TABLE (source_type text, source_id uuid, code text, severity text, detail text, last_seen timestamptz,
               amount_cents bigint, source_date date, description text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT x.source_type, x.source_id, x.code, x.severity, x.detail, x.last_seen,
         CASE x.source_type WHEN 'payment' THEN coalesce(p.amount_cents, round(p.amount * 100)::bigint)
                            WHEN 'refund'  THEN rf.amount_cents
                            ELSE round(e.amount * 100)::bigint END,
         CASE x.source_type WHEN 'payment' THEN (p.paid_at AT TIME ZONE 'America/New_York')::date
                            WHEN 'refund'  THEN (rf.refunded_at AT TIME ZONE 'America/New_York')::date
                            ELSE coalesce(e.paid_at, e.date) END,
         CASE x.source_type WHEN 'payment' THEN concat_ws(' · ', t.name, nullif(p.category, ''), p.status,
                                                   CASE WHEN p.paid_at IS NULL THEN 'recorded ' || (p.created_at AT TIME ZONE 'America/New_York')::date END)
                            WHEN 'refund'  THEN concat_ws(' · ', 'Refund', rt.name, nullif(rp.category, ''), nullif(rf.reason, ''))
                            ELSE concat_ws(' · ', nullif(e.description, ''), nullif(e.vendor_name, ''), e.category) END
  FROM posting_exceptions x
  LEFT JOIN payments p ON x.source_type = 'payment' AND p.id = x.source_id
  LEFT JOIN tenants t  ON t.id = p.tenant_id
  LEFT JOIN expenses e ON x.source_type = 'expense' AND e.id = x.source_id
  LEFT JOIN payment_refunds rf ON x.source_type = 'refund' AND rf.id = x.source_id
  LEFT JOIN payments rp ON rp.id = rf.payment_id
  LEFT JOIN tenants rt ON rt.id = rp.tenant_id
  WHERE x.resolved_at IS NULL AND is_landlord()
  ORDER BY x.severity, x.last_seen DESC;
$$;

-- D5 and the offline rule: a Stripe Pay Rent receipt is Rent, and no Stripe receipt can be a late fee for now.
CREATE FUNCTION public.a2_payment_channel_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.origin = 'tenant_pay_rent' AND NEW.origin IS DISTINCT FROM OLD.origin THEN
    RAISE EXCEPTION 'A2: a Stripe Pay Rent payment stays a Pay Rent payment';
  END IF;
  IF NEW.origin = 'tenant_pay_rent' AND a2_cat(NEW.category) <> 'rent' THEN
    RAISE EXCEPTION 'A2: a Stripe Pay Rent payment is always Rent';
  END IF;
  IF NEW.stripe_payment_intent_id IS NOT NULL AND a2_cat(NEW.category) = 'late fee' THEN
    RAISE EXCEPTION 'A2: late fees are payable offline for now, so a Stripe payment cannot be a late fee';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER a2_payment_channel_guard BEFORE INSERT OR UPDATE OF category, origin, stripe_payment_intent_id ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.a2_payment_channel_guard();

-- A refund of a posted receipt: Dr the receipt's income (or deposit) account / Cr the account the
-- cash came into, dated the refund date. Idempotent and self-correcting like a1_sync.
CREATE FUNCTION public.a2_sync_refund(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r payment_refunds; p payments; c record; a journal_entries; v_sig jsonb; v_ver int; v_entry uuid;
        v_dr uuid; v_cr uuid; v_date date;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('refund:' || p_id::text, 0));
  a := a1_active_entry('refund', p_id);
  SELECT * INTO r FROM payment_refunds WHERE id = p_id;
  IF r.id IS NULL THEN
    IF a.id IS NOT NULL THEN PERFORM a1_reverse_entry(a.id, 'Reversal: refund removed'); END IF;
    RETURN;
  END IF;
  IF r.reversed_at IS NOT NULL THEN
    IF a.id IS NOT NULL THEN PERFORM a1_reverse_entry(a.id, 'Reversal: ' || r.reversed_reason); END IF;
    PERFORM a1_resolve_others('refund', p_id, '{}');
    RETURN;
  END IF;
  SELECT * INTO p FROM payments WHERE id = r.payment_id;
  SELECT * INTO c FROM a1_classify_payment(p);
  IF NOT coalesce(c.qualifies, false) THEN
    IF a.id IS NOT NULL THEN PERFORM a1_reverse_entry(a.id, 'Reversal: refunded payment no longer in the ledger'); END IF;
    PERFORM a1_note('refund', p_id, 'refund_on_unposted_payment', 'error',
                    'The refunded payment is not in the ledger (' || coalesce(c.err, c.excluded_reason, 'unknown') || ')');
    PERFORM a1_resolve_others('refund', p_id, ARRAY['refund_on_unposted_payment']);
    RETURN;
  END IF;
  v_date := (r.refunded_at AT TIME ZONE 'America/New_York')::date;
  v_sig := jsonb_build_object('amount', r.amount_cents, 'date', v_date, 'books', c.books, 'debit', c.credit_code,
                              'credit', c.debit_code, 'property', c.property_id, 'unit', c.unit_id, 'tenant', p.tenant_id);
  IF a.id IS NOT NULL AND a.signature = v_sig THEN PERFORM a1_resolve_others('refund', p_id, '{}'); RETURN; END IF;
  IF a.id IS NOT NULL THEN PERFORM a1_reverse_entry(a.id, 'Reversal: refund changed'); END IF;

  SELECT id INTO v_dr FROM gl_accounts WHERE accounting_entity_id = c.books AND code = c.credit_code;
  SELECT id INTO v_cr FROM gl_accounts WHERE accounting_entity_id = c.books AND code = c.debit_code;
  IF v_dr IS NULL OR v_cr IS NULL THEN RAISE EXCEPTION 'A2: chart of accounts incomplete for books %', c.books; END IF;
  SELECT coalesce(max(source_version), 0) + 1 INTO v_ver FROM journal_entries WHERE source_type = 'refund' AND source_id = p_id;
  INSERT INTO journal_entries (accounting_entity_id, entry_date, memo, source_type, source_id, source_version, kind, signature)
  VALUES (c.books, v_date, concat_ws(' · ', 'Refund', nullif(btrim(p.category), ''), nullif(btrim(r.reason), '')), 'refund', p_id, v_ver, 'post', v_sig)
  RETURNING id INTO v_entry;
  INSERT INTO journal_lines (journal_entry_id, account_id, debit_cents, credit_cents, property_id, unit_id, tenant_id)
  SELECT v_entry, x.acct, x.dr, x.cr, c.property_id, c.unit_id, p.tenant_id
  FROM (VALUES (v_dr, r.amount_cents, 0::bigint), (v_cr, 0::bigint, r.amount_cents)) AS x(acct, dr, cr);
  PERFORM a1_resolve_others('refund', p_id, '{}');
END;
$$;

CREATE FUNCTION public.a2_refund_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN PERFORM a2_sync_refund(NEW.id);
  EXCEPTION WHEN OTHERS THEN PERFORM a1_note('refund', NEW.id, 'posting_failed', 'error', left(SQLERRM, 500)); END;
  RETURN NULL;
END;
$$;
CREATE TRIGGER a2_post_refunds AFTER INSERT OR UPDATE ON public.payment_refunds
  FOR EACH ROW EXECUTE FUNCTION public.a2_refund_trigger();

-- A change to a payment (void, reclassification…) re-syncs its refunds.
CREATE FUNCTION public.a2_payment_refund_resync() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid;
BEGIN
  FOR v IN SELECT id FROM payment_refunds WHERE payment_id = NEW.id LOOP
    BEGIN PERFORM a2_sync_refund(v);
    EXCEPTION WHEN OTHERS THEN PERFORM a1_note('refund', v, 'posting_failed', 'error', left(SQLERRM, 500)); END;
  END LOOP;
  RETURN NULL;
END;
$$;
CREATE TRIGGER a2_resync_refunds AFTER UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.a2_payment_refund_resync();


-- ============================================================
-- PART 5: RLS / grants
-- ============================================================
ALTER TABLE public.a2_settings              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_charges           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_application_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_refunds          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.a2_opening_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_fee_events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.a2_late_fee_exemptions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.a2_late_fee_audit        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.a2_late_fee_runs         ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.a2_settings, public.tenant_charges, public.payment_application_pins, public.payment_refunds, public.a2_opening_confirmations, public.stripe_fee_events, public.a2_late_fee_exemptions, public.a2_late_fee_audit, public.a2_late_fee_runs
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.a2_settings, public.tenant_charges, public.payment_application_pins, public.payment_refunds, public.a2_opening_confirmations, public.stripe_fee_events, public.a2_late_fee_exemptions, public.a2_late_fee_audit, public.a2_late_fee_runs TO authenticated;
GRANT ALL ON public.a2_settings, public.tenant_charges, public.payment_application_pins, public.payment_refunds, public.a2_opening_confirmations, public.stripe_fee_events, public.a2_late_fee_exemptions, public.a2_late_fee_audit TO service_role;
GRANT SELECT ON public.a2_late_fee_runs TO service_role;

CREATE POLICY a2_landlord_read_settings ON public.a2_settings FOR SELECT TO authenticated USING (is_landlord());
CREATE POLICY a2_landlord_read_charges  ON public.tenant_charges FOR SELECT TO authenticated USING (is_landlord());
CREATE POLICY a2_tenant_read_own_charges ON public.tenant_charges FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT t.id FROM public.tenants t WHERE t.user_id = auth.uid()));
CREATE POLICY a2_landlord_read_confirmations ON public.a2_opening_confirmations FOR SELECT TO authenticated USING (is_landlord());
CREATE POLICY a2_landlord_read_fee_events ON public.stripe_fee_events FOR SELECT TO authenticated USING (is_landlord());
CREATE POLICY a2_landlord_read_exemptions ON public.a2_late_fee_exemptions FOR SELECT TO authenticated USING (is_landlord());
CREATE POLICY a2_landlord_read_late_fee_audit ON public.a2_late_fee_audit FOR SELECT TO authenticated USING (is_landlord());
CREATE POLICY a2_landlord_read_late_fee_runs ON public.a2_late_fee_runs FOR SELECT TO authenticated USING (is_landlord());
CREATE POLICY a2_landlord_read_pins     ON public.payment_application_pins FOR SELECT TO authenticated USING (is_landlord());
CREATE POLICY a2_landlord_read_refunds  ON public.payment_refunds FOR SELECT TO authenticated USING (is_landlord());
CREATE POLICY a2_tenant_read_own_refunds ON public.payment_refunds FOR SELECT TO authenticated
  USING (payment_id IN (SELECT p.id FROM public.payments p JOIN public.tenants t ON t.id = p.tenant_id WHERE t.user_id = auth.uid()));

-- Internal engine: never callable by clients
REVOKE EXECUTE ON FUNCTION public.a2_cutover(), public.a2_in_scope(uuid, text, uuid), public.a2_receipts(date),
  public.a2_applications(date, uuid), public.a2_open_charges_internal(date, uuid), public.a2_can_see_tenant(uuid),
  public.a2_require_landlord(), public.a2_require_active(), public.a2_is_service(), public.a2_sync_refund(uuid), public.a2_refund_trigger(),
  public.a2_payment_refund_resync(), public.a2_refund_guard(), public.a2_charge_guard(), public.a2_append_only(),
  public.a2_assess_late_fees_at(date, boolean), public.a2_assess_scheduled_at(date), public.a2_refund_transfer_lines(uuid), public.a2_payment_channel_guard(), public.a2_pay_rent_internal(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
-- Client API (each function checks the caller itself)
REVOKE EXECUTE ON FUNCTION public.a2_status(), public.a2_open_charges(uuid, date), public.a2_tenant_ledger(uuid),
  public.a2_tenant_balances(date, text, uuid), public.a2_tenant_open_charges(uuid, date, text, uuid), public.a2_pay_rent_due(uuid), public.a2_payment_route_gaps(), public.a2_tie_out(),
  public.a2_set_cutover(date), public.a2_add_charge(uuid, text, bigint, date, text, boolean), public.a2_void_charge(uuid, text),
  public.a2_generate_charges(date), public.a2_assess_late_fees(), public.a2_pin_application(uuid, uuid, bigint),
  public.a2_unpin_application(uuid, uuid), public.a2_record_refund(uuid, bigint, date, text), public.a2_void_payment(uuid, text),
  public.a2_opening_status(), public.a2_opening_entries(), public.a2_legacy_charge_rows(), public.a2_unlinked_receipts(), public.a2_stripe_fees(),
  public.a2_confirm_zero_opening(uuid), public.a2_category_reconciliation(uuid, date), public.a2_payment_applications(uuid),
  public.a2_late_fee_log(int), public.a2_grant_late_fee_exemption(uuid, date, date, text), public.a2_revoke_late_fee_exemption(uuid, text),
  public.a2_reverse_refund(uuid, text), public.a2_stripe_refunds()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.a2_status(), public.a2_open_charges(uuid, date), public.a2_tenant_ledger(uuid),
  public.a2_tenant_balances(date, text, uuid), public.a2_tenant_open_charges(uuid, date, text, uuid), public.a2_pay_rent_due(uuid), public.a2_payment_route_gaps(), public.a2_tie_out(),
  public.a2_set_cutover(date), public.a2_add_charge(uuid, text, bigint, date, text, boolean), public.a2_void_charge(uuid, text),
  public.a2_generate_charges(date), public.a2_assess_late_fees(), public.a2_pin_application(uuid, uuid, bigint),
  public.a2_unpin_application(uuid, uuid), public.a2_record_refund(uuid, bigint, date, text), public.a2_void_payment(uuid, text),
  public.a2_opening_status(), public.a2_opening_entries(), public.a2_legacy_charge_rows(), public.a2_unlinked_receipts(), public.a2_stripe_fees(),
  public.a2_confirm_zero_opening(uuid), public.a2_category_reconciliation(uuid, date), public.a2_payment_applications(uuid),
  public.a2_late_fee_log(int), public.a2_grant_late_fee_exemption(uuid, date, date, text), public.a2_revoke_late_fee_exemption(uuid, text),
  public.a2_reverse_refund(uuid, text), public.a2_stripe_refunds()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.a2_generate_charges(date), public.a2_assess_late_fees(), public.a2_pay_rent_internal(uuid) TO service_role;


-- ============================================================
-- PART 6: Postconditions
-- ============================================================
DO $$
DECLARE v int;
BEGIN
  IF (SELECT cutover_date FROM a2_settings) IS NOT NULL THEN RAISE EXCEPTION 'A2 post: cutover must start unset (D4)'; END IF;
  SELECT count(*) INTO v FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relrowsecurity
    AND relname IN ('a2_settings','tenant_charges','payment_application_pins','payment_refunds','a2_opening_confirmations',
                    'stripe_fee_events','a2_late_fee_exemptions','a2_late_fee_audit','a2_late_fee_runs');
  IF v <> 9 THEN RAISE EXCEPTION 'A2 post: RLS not enabled on all A2 tables'; END IF;
  IF has_table_privilege('anon', 'public.tenant_charges', 'SELECT') OR has_table_privilege('authenticated', 'public.tenant_charges', 'INSERT')
     OR has_table_privilege('authenticated', 'public.payment_refunds', 'INSERT') THEN
    RAISE EXCEPTION 'A2 post: client write/anon privileges present';
  END IF;
  IF has_function_privilege('authenticated', 'public.a2_applications(date,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.a2_sync_refund(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.a2_assess_late_fees_at(date,boolean)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.a2_assess_late_fees_at(date,boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.a2_assess_scheduled_at(date)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.a2_assess_scheduled_at(date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'A2 post: internal engine is client-callable';
  END IF;
  IF EXISTS (SELECT 1 FROM tenant_charges) THEN RAISE EXCEPTION 'A2 post: charges created by the migration'; END IF;
  -- A1 untouched in effect: the replaced classifier gives every existing payment the same result
  IF EXISTS (SELECT 1 FROM payments p CROSS JOIN LATERAL a1_classify_payment(p) c
             LEFT JOIN a2_pre_classification x ON x.id = p.id WHERE x.c IS DISTINCT FROM to_jsonb(c)) THEN
    RAISE EXCEPTION 'A2 post: the classifier change altered an existing payment''s classification';
  END IF;
END $$;


-- ============================================================
-- PART 7: Behaviour checks (synthetic, 2099; rolled back to the savepoint)
-- ============================================================
SAVEPOINT a2_verify;

DO $$
DECLARE
  v_ll uuid; v_books uuid; v_prop uuid := gen_random_uuid(); v_unit uuid := gen_random_uuid(); v_ten uuid := gen_random_uuid();
  v_rc uuid := gen_random_uuid(); v_pay uuid := gen_random_uuid(); v_j0 int; v_j1 int; v_n int; v_o bigint;
BEGIN
  SELECT id INTO v_ll FROM profiles WHERE role = 'landlord' ORDER BY id LIMIT 1;
  IF v_ll IS NULL THEN RAISE NOTICE 'A2 verify: no landlord profile; behaviour checks skipped'; RETURN; END IF;
  PERFORM set_config('request.jwt.claim.sub', v_ll::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_ll, 'role', 'authenticated')::text, true);
  SELECT id INTO v_books FROM accounting_entities ORDER BY name LIMIT 1;
  INSERT INTO properties (id, name, address, city, state, zip, accounting_entity_id) VALUES (v_prop, 'A2 verify', '1 V St', 'X', 'OH', '00000', v_books);
  INSERT INTO units (id, property_id, unit_number, rent_amount) VALUES (v_unit, v_prop, 'V', 1000);
  INSERT INTO tenants (id, name, email, unit_id) VALUES (v_ten, 'A2 Verify Tenant', 'a2v@test.invalid', v_unit);
  PERFORM a2_set_cutover('2099-01-01');
  INSERT INTO recurring_charges (id, tenant_id, category, amount, start_date) VALUES (v_rc, v_ten, 'Rent', 1000, '2099-01-01');

  SELECT count(*) INTO v_j0 FROM journal_entries;
  PERFORM a2_generate_charges('2099-02-15'); PERFORM a2_generate_charges('2099-02-15');   -- retry: no duplicates
  SELECT count(*) INTO v_n FROM tenant_charges WHERE schedule_id = v_rc;
  IF v_n <> 2 THEN RAISE EXCEPTION 'A2 verify: expected 2 rent charges (Jan, Feb), found %', v_n; END IF;

  INSERT INTO payments (id, tenant_id, unit_id, category, amount_cents, status, paid_at)
  VALUES (v_pay, v_ten, v_unit, 'Rent', 100000, 'paid', '2099-01-03T17:00:00Z');
  SELECT sum(open_cents) INTO v_o FROM a2_open_charges_internal('2099-02-15', v_ten);
  IF v_o <> 100000 THEN RAISE EXCEPTION 'A2 verify: expected $1,000 open (Feb), found %', v_o; END IF;

  BEGIN PERFORM a2_assess_late_fees_at('2099-02-05'); RAISE EXCEPTION 'A2 verify: late fee before the 6th allowed';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%6th%' THEN RAISE; END IF; END;
  PERFORM a2_assess_late_fees_at('2099-02-06'); PERFORM a2_assess_late_fees_at('2099-02-20');
  SELECT count(*) INTO v_n FROM tenant_charges WHERE tenant_id = v_ten AND source = 'late_fee';
  IF v_n <> 1 THEN RAISE EXCEPTION 'A2 verify: expected exactly one $50 late fee for Feb, found %', v_n; END IF;

  SELECT count(*) INTO v_j1 FROM journal_entries;
  IF v_j1 <> v_j0 + 1 THEN RAISE EXCEPTION 'A2 verify: charges reached the journal (% → %)', v_j0, v_j1; END IF;   -- only the receipt posted

  PERFORM a2_record_refund(v_pay, 20000, '2099-02-10', 'verify partial refund');
  IF NOT EXISTS (SELECT 1 FROM journal_entries WHERE source_type = 'refund' AND entry_date = '2099-02-10' AND kind = 'post') THEN
    RAISE EXCEPTION 'A2 verify: refund not posted on its date';
  END IF;
  SELECT sum(open_cents) INTO v_o FROM a2_open_charges_internal('2099-02-20', v_ten);
  IF v_o <> 100000 + 20000 + 5000 THEN RAISE EXCEPTION 'A2 verify: expected $1,250 open after refund + late fee, found %', v_o; END IF;
  -- A Stripe refund of the rest of the payment, delivered twice: recorded once, no error.
  INSERT INTO payment_refunds (payment_id, amount_cents, refunded_at, stripe_refund_id) VALUES (v_pay, 80000, '2099-02-11T15:00:00Z', 're_a2_verify');
  INSERT INTO payment_refunds (payment_id, amount_cents, refunded_at, stripe_refund_id) VALUES (v_pay, 80000, '2099-02-11T15:00:00Z', 're_a2_verify')
    ON CONFLICT (stripe_refund_id) DO NOTHING;
  IF (SELECT count(*) FROM payment_refunds WHERE stripe_refund_id = 're_a2_verify') <> 1 THEN
    RAISE EXCEPTION 'A2 verify: a redelivered refund was not idempotent';
  END IF;
  IF EXISTS (SELECT 1 FROM a2_tie_out() WHERE ledger_cents <> journal_cents OR charges_in_journal <> 0) THEN
    RAISE EXCEPTION 'A2 verify: tenant ledger and journal do not tie out';
  END IF;

  BEGIN UPDATE tenant_charges SET amount_cents = 1 WHERE schedule_id = v_rc; RAISE EXCEPTION 'A2 verify: charge edit allowed';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%immutable%' THEN RAISE; END IF; END;
END $$;

ROLLBACK TO SAVEPOINT a2_verify;
RELEASE SAVEPOINT a2_verify;

SELECT 'A2 receivables applied and verified' AS result,
       (SELECT cutover_date FROM a2_settings) AS cutover_date,
       (SELECT count(*) FROM tenant_charges) AS charges;

COMMIT;


-- ============================================================
-- ROLLBACK (manual; only while no refund has been posted — the journal is append-only)
-- ============================================================
-- BEGIN;
-- DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.journal_entries WHERE source_type = 'refund') THEN
--   RAISE EXCEPTION 'A2 rollback: refund entries exist in the journal; cannot roll back'; END IF; END $$;
-- DROP TRIGGER IF EXISTS a2_resync_refunds ON public.payments;
-- DROP TRIGGER IF EXISTS a2_post_refunds ON public.payment_refunds;
-- DROP FUNCTION IF EXISTS public.a2_opening_status(), public.a2_opening_entries(), public.a2_legacy_charge_rows(),
--   public.a2_unlinked_receipts(), public.a2_stripe_fees(), public.a2_confirm_zero_opening(uuid),
--   public.a2_category_reconciliation(uuid, date), public.a2_payment_applications(uuid), public.a2_late_fee_log(int),
--   public.a2_grant_late_fee_exemption(uuid, date, date, text), public.a2_revoke_late_fee_exemption(uuid, text),
--   public.a2_reverse_refund(uuid, text), public.a2_assess_late_fees(), public.a2_assess_scheduled_at(date),
--   public.a2_assess_late_fees_at(date, boolean), public.a2_stripe_refunds(), public.a2_refund_transfer_lines(uuid);
-- DROP TRIGGER IF EXISTS a2_payment_channel_guard ON public.payments;
-- DROP FUNCTION IF EXISTS public.a2_payment_channel_guard();
-- CREATE OR REPLACE FUNCTION public.a1_open_exceptions()
-- RETURNS TABLE (source_type text, source_id uuid, code text, severity text, detail text, last_seen timestamptz,
--                amount_cents bigint, source_date date, description text)
-- LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $fn$
--   SELECT x.source_type, x.source_id, x.code, x.severity, x.detail, x.last_seen,
--          CASE x.source_type WHEN 'payment' THEN coalesce(p.amount_cents, round(p.amount * 100)::bigint)
--                             ELSE round(e.amount * 100)::bigint END,
--          CASE x.source_type WHEN 'payment' THEN (p.paid_at AT TIME ZONE 'America/New_York')::date
--                             ELSE coalesce(e.paid_at, e.date) END,
--          CASE x.source_type WHEN 'payment' THEN concat_ws(' · ', t.name, nullif(p.category, ''), p.status,
--                                                    CASE WHEN p.paid_at IS NULL THEN 'recorded ' || (p.created_at AT TIME ZONE 'America/New_York')::date END)
--                             ELSE concat_ws(' · ', nullif(e.description, ''), nullif(e.vendor_name, ''), e.category) END
--   FROM posting_exceptions x
--   LEFT JOIN payments p ON x.source_type = 'payment' AND p.id = x.source_id
--   LEFT JOIN tenants t  ON t.id = p.tenant_id
--   LEFT JOIN expenses e ON x.source_type = 'expense' AND e.id = x.source_id
--   WHERE x.resolved_at IS NULL AND is_landlord()
--   ORDER BY x.severity, x.last_seen DESC;
-- $fn$;
-- DROP FUNCTION IF EXISTS public.a2_status(), public.a2_open_charges(uuid, date), public.a2_tenant_ledger(uuid),
--   public.a2_tenant_balances(date, text, uuid), public.a2_tenant_open_charges(uuid, date, text, uuid), public.a2_pay_rent_due(uuid), public.a2_pay_rent_internal(uuid), public.a2_payment_route_gaps(), public.a2_tie_out(),
--   public.a2_set_cutover(date), public.a2_add_charge(uuid, text, bigint, date, text, boolean), public.a2_void_charge(uuid, text),
--   public.a2_generate_charges(date), public.a2_pin_application(uuid, uuid, bigint),
--   public.a2_unpin_application(uuid, uuid), public.a2_record_refund(uuid, bigint, date, text), public.a2_void_payment(uuid, text),
--   public.a2_sync_refund(uuid), public.a2_refund_trigger(), public.a2_payment_refund_resync(),
--   public.a2_open_charges_internal(date, uuid), public.a2_applications(date, uuid), public.a2_receipts(date),
--   public.a2_can_see_tenant(uuid), public.a2_require_landlord(), public.a2_require_active(), public.a2_is_service(), public.a2_in_scope(uuid, text, uuid),
--   public.a2_today(), public.a2_ny_date(timestamptz), public.a2_cutover();
-- DROP TABLE IF EXISTS public.a2_late_fee_runs, public.a2_late_fee_audit, public.a2_late_fee_exemptions, public.stripe_fee_events, public.a2_opening_confirmations, public.payment_refunds, public.payment_application_pins, public.tenant_charges, public.a2_settings;
-- DROP FUNCTION IF EXISTS public.a2_refund_guard(), public.a2_charge_guard(), public.a2_append_only(), public.a2_cat(text);
-- DELETE FROM public.posting_exceptions WHERE source_type = 'refund';
-- ALTER TABLE public.posting_exceptions DROP CONSTRAINT posting_exceptions_source_type_check;
-- ALTER TABLE public.posting_exceptions ADD CONSTRAINT posting_exceptions_source_type_check CHECK (source_type IN ('payment','expense'));
-- ALTER TABLE public.journal_entries DROP CONSTRAINT journal_entries_source_type_check;
-- ALTER TABLE public.journal_entries ADD CONSTRAINT journal_entries_source_type_check CHECK (source_type IN ('payment','expense'));
-- -- restore A1's classifier (identical to A1; no void line) before dropping payments.voided_at
-- CREATE OR REPLACE FUNCTION public.a1_classify_payment(p payments,
--   OUT qualifies boolean, OUT excluded_reason text, OUT err text, OUT warnings text[],
--   OUT amount_cents bigint, OUT fee_cents bigint, OUT entry_date date, OUT books uuid,
--   OUT property_id uuid, OUT unit_id uuid, OUT debit_code text, OUT credit_code text)
-- LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
-- DECLARE m record; v_unit uuid; v_dollars bigint;
-- BEGIN
--   qualifies := false; warnings := '{}';
--   IF p.id IS NULL THEN excluded_reason := 'deleted'; RETURN; END IF;
--   IF lower(coalesce(p.status, '')) <> 'paid' THEN excluded_reason := 'status:' || coalesce(p.status, 'null'); RETURN; END IF;
--   IF p.due_date IS NOT NULL OR p.balance_due IS NOT NULL THEN err := 'charge_row_marked_paid'; RETURN; END IF;
--   v_dollars := CASE WHEN p.amount IS NULL THEN NULL ELSE round(p.amount * 100)::bigint END;
--   IF p.amount_cents IS NOT NULL AND v_dollars IS NOT NULL AND p.amount_cents <> v_dollars THEN err := 'ambiguous_amount'; RETURN; END IF;
--   amount_cents := coalesce(p.amount_cents, v_dollars);
--   IF amount_cents IS NULL OR amount_cents <= 0 THEN err := 'missing_or_nonpositive_amount'; RETURN; END IF;
--   SELECT * INTO m FROM a1_payment_account(p.category);
--   IF m.err IS NOT NULL THEN err := m.err; RETURN; END IF;
--   credit_code := m.code;
--   IF m.warn IS NOT NULL THEN warnings := warnings || m.warn; END IF;
--   v_unit := p.unit_id;
--   IF v_unit IS NULL THEN err := 'no_unit'; RETURN; END IF;
--   unit_id := v_unit;
--   SELECT u.property_id, pr.accounting_entity_id INTO property_id, books FROM units u LEFT JOIN properties pr ON pr.id = u.property_id WHERE u.id = v_unit;
--   IF property_id IS NULL THEN err := 'no_property'; RETURN; END IF;
--   IF books IS NULL THEN err := 'property_without_books'; RETURN; END IF;
--   IF p.paid_at IS NULL THEN err := 'missing_paid_date'; RETURN; END IF;
--   entry_date := (p.paid_at AT TIME ZONE 'America/New_York')::date;
--   debit_code := CASE WHEN p.stripe_payment_intent_id IS NOT NULL THEN '1050' ELSE '1000' END;
--   fee_cents := CASE WHEN p.stripe_payment_intent_id IS NOT NULL THEN greatest(coalesce(p.platform_fee_cents, 0), 0) ELSE 0 END;
--   qualifies := true;
-- END;
-- $fn$;
-- ALTER TABLE public.payments DROP COLUMN voided_at, DROP COLUMN voided_by, DROP COLUMN void_reason, DROP COLUMN origin,
--   DROP COLUMN stripe_fee_cents, DROP COLUMN stripe_net_cents, DROP COLUMN stripe_balance_transaction_id,
--   DROP COLUMN stripe_application_fee_id, DROP COLUMN stripe_application_fee_cents, DROP COLUMN stripe_transfer_id,
--   DROP COLUMN stripe_transfer_cents, DROP COLUMN stripe_transfer_destination;
-- SELECT public.a1_backfill();   -- voided payments qualify again under A1 rules and are re-posted
-- COMMIT;
