-- ============================================================
-- A3: Financial Foundation & Collections
-- Requires A1 and A2. LOCAL ONLY until approved. See docs/a3-schema-and-migration-plan.md.
--
--   Part 0  Preconditions and before-state snapshots
--   Part 1  Schema: payment_applications, book_transactions, journal source types, chart additions
--   Part 2  Permanent payment applications: engine, guard, triggers, actions (owner requirement, D5)
--   Part 3  D10 refunds: refund posting, transfer reversals, Modus fee refunds, reconciliation
--   Part 4  Book transactions: opening balances, owner contributions / distributions, transfers, settlements
--   Part 5  Reports: Balance Sheet, Trial Balance, account activity, deposits, collections, platform economics
--   Part 6  RLS / grants
--   Part 7  Carry A2's calculated applications forward; postconditions
--   Part 8  Behaviour checks inside a SAVEPOINT (rolled back)
--
-- RULES
--   * A1's accounting rules are unchanged: cash basis, charges never post, a receipt posts only with a paid
--     date, unit and category, and nothing is inferred. a1_classify_payment and a1_sync are not touched.
--   * Applications are stored when they happen and are append-only. A correction is a reversal row plus a new
--     application; the earlier rows stay. A later correction can't change what an earlier date shows.
--   * D5 holds: same tenant, same category, oldest due first, excess stays as credit in that category. A Stripe
--     Pay Rent receipt is Rent only, and no Stripe receipt can pay a late fee. Money also stays in its own set
--     of books, so a receipt for one owner can never pay a charge on another owner's property.
--   * Business model (owner, 2026-11-03): Modus earns 5% of rent actually collected, offline included; the owner gets 95%.
--     Modus's operating costs and Stripe's fees come out of its 5%. They are never an owner expense.
--     On a Stripe destination charge the 5% is withheld (A1's existing posting). Otherwise it accrues as owed by the owner:
--     Dr 6100 Modus Management Fee / Cr 2195 Modus Management Fee Payable, from the receivables cutover on. Earlier receipts are never inferred.
--   * Adjustments are rental credits: no cash, no journal entry, applied to next month's rent even if older arrears exist.
--   * ACH failing BEFORE settlement never posted, and Stripe reverses it. A return AFTER success reverses the receipt, its 95% and its 5%.
--     Stripe doesn't reverse the transfer then, so the owner's 95% shows as owed in 2190 until a person reverses it in the Dashboard.
--     Modus tracks the recovery and never initiates it.
--   * A returned payment stays collected for dates before its return date.
--   * A rent refund isn't a normal workflow. If Stripe reports one, it reverses the income and the 5%, and 2190 tracks the owner's 95%.
--   * Stripe fees, fee reversals and return or dispute fees never post to owner books. They appear only on Modus's own report.
--   * Opening balances are entered explicitly, account by account. Nothing is inferred from history.
-- ============================================================

BEGIN;

-- ============================================================
-- PART 0: Preconditions and snapshots
-- ============================================================
DO $$
BEGIN
  IF to_regclass('public.tenant_charges') IS NULL OR to_regprocedure('public.a2_applications(date,uuid)') IS NULL THEN
    RAISE EXCEPTION 'A3 precondition: A2 receivables are not applied';
  END IF;
  IF to_regclass('public.journal_entries') IS NULL THEN RAISE EXCEPTION 'A3 precondition: A1 ledger is not applied'; END IF;
  IF to_regclass('public.payment_applications') IS NOT NULL OR to_regclass('public.book_transactions') IS NOT NULL THEN
    RAISE EXCEPTION 'A3 precondition: already applied';
  END IF;
  IF to_regprocedure('public.is_landlord()') IS NULL THEN RAISE EXCEPTION 'A3 precondition: is_landlord() missing'; END IF;
END $$;

-- What A2 calculates today, to carry forward (Part 7) and to compare against afterwards.
CREATE TEMP TABLE a3_pre_applications ON COMMIT DROP AS
  SELECT * FROM public.a2_applications(DATE '9999-12-31', NULL);
CREATE TEMP TABLE a3_pre_open ON COMMIT DROP AS
  SELECT o.charge_id, o.open_cents FROM public.a2_open_charges_internal(DATE '9999-12-31', NULL) o;
-- Income by books and account, excluding refunds, which Part 7 re-syncs under D10 (income is unaffected).
CREATE TEMP TABLE a3_pre_income ON COMMIT DROP AS
  SELECT je.accounting_entity_id books, a.code, sum(l.credit_cents - l.debit_cents)::bigint net
  FROM public.journal_entries je JOIN public.journal_lines l ON l.journal_entry_id = je.id JOIN public.gl_accounts a ON a.id = l.account_id
  WHERE a.type IN ('income','expense') GROUP BY 1, 2;
CREATE TEMP TABLE a3_pre_classification ON COMMIT DROP AS
  SELECT p.id, to_jsonb(c) AS c FROM public.payments p CROSS JOIN LATERAL public.a1_classify_payment(p) c;

-- Replaced A1/A2 functions are kept verbatim so the rollback block can restore them exactly.
CREATE TABLE public.a3_replaced_functions (signature text PRIMARY KEY, definition text NOT NULL);
INSERT INTO public.a3_replaced_functions
  SELECT s, pg_get_functiondef(to_regprocedure(s))
  FROM unnest(ARRAY['public.a2_applications(date,uuid)', 'public.a2_payment_applications(uuid)', 'public.a2_pin_application(uuid,uuid,bigint)',
                    'public.a2_unpin_application(uuid,uuid)', 'public.a2_sync_refund(uuid)', 'public.a1_open_exceptions()',
                    'public.a2_receipts(date)', 'public.a2_tenant_ledger(uuid)']) s;


-- ============================================================
-- PART 1: Schema
-- ============================================================
-- The journal gains two source types; posting exceptions also learn charges.
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
ALTER TABLE public.journal_entries    ADD CONSTRAINT journal_entries_source_type_check
  CHECK (source_type IN ('payment','expense','refund','book_txn','stripe_event','modus_fee','payment_return'));
ALTER TABLE public.posting_exceptions ADD CONSTRAINT posting_exceptions_source_type_check
  CHECK (source_type IN ('payment','expense','refund','book_txn','stripe_event','charge','modus_fee','payment_return'));

-- Stripe's return and dispute fees are captured like its other fees: Modus's cost, never posted to owner books.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.stripe_fee_events'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%refund_rejected%'
  LOOP EXECUTE format('ALTER TABLE public.stripe_fee_events DROP CONSTRAINT %I', r.conname); END LOOP;
END $$;
ALTER TABLE public.stripe_fee_events ADD CONSTRAINT stripe_fee_events_kind_check
  CHECK (kind IN ('refund_balance_transaction','transfer_reversal','application_fee_refund','refund_failed','refund_rejected','dispute_fee','return_rejected'));

-- Rental credits are a new kind of tenant charge: negative, Rent only, and aimed at a stated month.
ALTER TABLE public.tenant_charges ADD COLUMN applies_from date;
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.tenant_charges'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%opening_balance%'
  LOOP EXECUTE format('ALTER TABLE public.tenant_charges DROP CONSTRAINT %I', r.conname); END LOOP;
END $$;
ALTER TABLE public.tenant_charges
  ADD CONSTRAINT tenant_charges_source_check CHECK (source IN ('schedule','late_fee','manual','opening_balance','rental_credit')),
  ADD CONSTRAINT tenant_charges_negative_check CHECK (amount_cents > 0 OR source IN ('opening_balance','rental_credit')),
  ADD CONSTRAINT tenant_charges_rental_credit_check CHECK (source <> 'rental_credit' OR (amount_cents < 0 AND public.a2_cat(category) = 'rent' AND applies_from IS NOT NULL AND coalesce(btrim(memo), '') <> '')),
  ADD CONSTRAINT tenant_charges_applies_from_check CHECK (applies_from IS NULL OR source = 'rental_credit');

-- Chart additions. a1_seed_chart still seeds A1's 20 accounts; these are added alongside for every set of books.
-- 6100 holds Modus's 5%, an expense on the owner's books, so its A1 label "Payment Processing Fees" is corrected. Posting is unchanged.
CREATE FUNCTION public.a3_seed_chart(p_books uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO gl_accounts (accounting_entity_id, code, name, type)
  SELECT p_books, c, n, t FROM (VALUES
    ('2190', 'Due to Modus: Returned and Refunded Rent', 'liability'),
    ('2195', 'Modus Management Fee Payable', 'liability'),
    ('3100', 'Owner Contributions', 'equity'),
    ('3200', 'Owner Distributions', 'equity'),
    ('3900', 'Opening Balance Equity', 'equity')) AS s(c, n, t)
  ON CONFLICT (accounting_entity_id, code) DO NOTHING;
  UPDATE gl_accounts SET name = 'Modus Management Fee' WHERE accounting_entity_id = p_books AND code = '6100';
$$;
CREATE FUNCTION public.a3_books_seed_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM a3_seed_chart(NEW.id); RETURN NULL; END;
$$;
CREATE TRIGGER a3_seed_chart_on_books AFTER INSERT ON public.accounting_entities
  FOR EACH ROW EXECUTE FUNCTION public.a3_books_seed_trigger();
SELECT public.a3_seed_chart(id) FROM public.accounting_entities;

-- Every allocation of money to a charge, and every correction of one. Append-only.
--   kind 'apply'    : money from a receipt or opening credit went to a charge.
--   kind 'reversal' : some or all of an earlier application was taken back (reverses_id says which).
-- effective_on is the accounting date: reports as of an earlier date ignore rows dated after it.
-- created_at and created_by say when and by whom it was actually recorded.
-- payment_id deliberately has no foreign key, like the journal's source_id: history outlives a deleted payment.
CREATE TABLE public.payment_applications (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq              bigint GENERATED ALWAYS AS IDENTITY,
  kind             text NOT NULL CHECK (kind IN ('apply','reversal')),
  tenant_id        uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  cat              text NOT NULL,
  payment_id       uuid,
  credit_charge_id uuid REFERENCES public.tenant_charges(id) ON DELETE RESTRICT,
  charge_id        uuid NOT NULL REFERENCES public.tenant_charges(id) ON DELETE RESTRICT,
  amount_cents     bigint NOT NULL CHECK (amount_cents > 0),
  effective_on     date NOT NULL,
  reverses_id      uuid REFERENCES public.payment_applications(id) ON DELETE RESTRICT,
  origin           text NOT NULL CHECK (origin IN ('automatic','manual','migration')),
  event            text NOT NULL CHECK (btrim(event) <> ''),
  correction_id    uuid,
  created_by       uuid DEFAULT auth.uid(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK ((payment_id IS NULL) <> (credit_charge_id IS NULL)),
  CHECK ((kind = 'reversal') = (reverses_id IS NOT NULL))
);
CREATE INDEX payment_applications_tenant ON public.payment_applications (tenant_id, cat);
CREATE INDEX payment_applications_payment ON public.payment_applications (payment_id);
CREATE INDEX payment_applications_charge ON public.payment_applications (charge_id);
CREATE INDEX payment_applications_reverses ON public.payment_applications (reverses_id);

-- Landlord-entered transactions that aren't tenant receipts or expenses. Immutable apart from a one-time void.
CREATE TABLE public.book_transactions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accounting_entity_id  uuid NOT NULL REFERENCES public.accounting_entities(id) ON DELETE RESTRICT,
  property_id           uuid REFERENCES public.properties(id) ON DELETE RESTRICT,
  txn_type              text NOT NULL CHECK (txn_type IN ('opening_balance','owner_contribution','owner_distribution','cash_transfer','modus_settlement','modus_fee_payment')),
  txn_date              date NOT NULL,
  amount_cents          bigint NOT NULL CHECK (amount_cents > 0),
  cash_account          text CHECK (cash_account IN ('1000','1050')),    -- the cash side; for a transfer, where it landed
  from_account          text CHECK (from_account IN ('1000','1050')),    -- a transfer's source
  account_code          text CHECK (account_code IN ('1000','1050','2100','3000')),   -- the account an opening balance is for
  tenant_id             uuid REFERENCES public.tenants(id) ON DELETE RESTRICT,         -- an opening deposit's tenant
  memo                  text NOT NULL CHECK (btrim(memo) <> ''),
  created_by            uuid DEFAULT auth.uid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  voided_at             timestamptz,
  voided_by             uuid,
  void_reason           text,
  CHECK ((voided_at IS NULL) = (void_reason IS NULL)),
  CHECK ((txn_type = 'opening_balance') = (account_code IS NOT NULL)),
  CHECK ((txn_type = 'cash_transfer') = (from_account IS NOT NULL)),
  CHECK (txn_type = 'opening_balance' OR cash_account IS NOT NULL),
  CHECK (from_account IS NULL OR from_account <> cash_account),
  CHECK (tenant_id IS NULL OR account_code = '2100')
);
-- A rent payment that came back after it had succeeded (Stripe's dispute), or a returned offline check. One per payment, never edited.
CREATE TABLE public.payment_returns (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id        uuid NOT NULL UNIQUE REFERENCES public.payments(id) ON DELETE RESTRICT,
  kind              text NOT NULL CHECK (kind IN ('ach_return','dispute','offline_return')),
  amount_cents      bigint NOT NULL CHECK (amount_cents > 0),
  returned_on       date NOT NULL,
  reason            text NOT NULL CHECK (btrim(reason) <> ''),
  stripe_dispute_id text UNIQUE,
  created_by        uuid DEFAULT auth.uid(),
  created_at        timestamptz NOT NULL DEFAULT now()
);
-- A direct repayment names the return it pays back. NULL on any other transaction, and on a settlement not tied to one payment.
ALTER TABLE public.book_transactions
  ADD COLUMN payment_return_id uuid REFERENCES public.payment_returns(id) ON DELETE RESTRICT,
  ADD CONSTRAINT book_transactions_return_link_check CHECK (payment_return_id IS NULL OR txn_type = 'modus_settlement');

-- One row per Stripe payment, so a repeated Pay Rent request can't record (and later post) the same payment twice.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.payments WHERE stripe_payment_intent_id IS NOT NULL GROUP BY stripe_payment_intent_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'A3: payments has duplicate stripe_payment_intent_id rows; resolve them before this migration';
  END IF;
END $$;
CREATE UNIQUE INDEX payments_stripe_payment_intent_unique ON public.payments (stripe_payment_intent_id);

-- One standing opening balance per account (and per tenant for deposits). Void it to replace it.
CREATE UNIQUE INDEX book_transactions_one_opening ON public.book_transactions
  (accounting_entity_id, account_code, coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(property_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE txn_type = 'opening_balance' AND voided_at IS NULL;


-- ============================================================
-- PART 2: Permanent payment applications
-- ============================================================
-- Applications still standing as of a date, with what remains of each after its reversals.
CREATE FUNCTION public.a3_active_applications(p_tenant uuid, p_as_of date)
RETURNS TABLE (id uuid, seq bigint, tenant_id uuid, cat text, payment_id uuid, credit_charge_id uuid, charge_id uuid,
               active_cents bigint, effective_on date, origin text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.seq, a.tenant_id, a.cat, a.payment_id, a.credit_charge_id, a.charge_id,
         a.amount_cents - rv.cents, a.effective_on, a.origin
  FROM payment_applications a
  CROSS JOIN LATERAL (SELECT coalesce(sum(r.amount_cents), 0)::bigint AS cents FROM payment_applications r
                      WHERE r.reverses_id = a.id AND r.effective_on <= p_as_of) rv
  WHERE a.kind = 'apply' AND a.effective_on <= p_as_of AND (p_tenant IS NULL OR a.tenant_id = p_tenant)
    AND a.amount_cents > rv.cents;
$$;

-- The payment as it stood when collected: lets a returned payment keep its books, dates and fee for history.
CREATE FUNCTION public.a3_collected_row(p payments) RETURNS payments
LANGUAGE plpgsql STABLE AS $$
BEGIN
  IF lower(coalesce(p.status, '')) = 'returned' THEN p.status := 'paid'; END IF;
  RETURN p;
END;
$$;

-- Receipts the tenant ledger recognises, as of a date, for one tenant or all. A returned payment counts until its return date.
CREATE FUNCTION public.a3_receipts(p_as_of date, p_tenant uuid)
RETURNS TABLE (payment_id uuid, tenant_id uuid, cat text, paid_on date, created_at timestamptz,
               gross_cents bigint, refunded_cents bigint, net_cents bigint, books uuid, property_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.tenant_id, a2_cat(p.category), c.entry_date, p.created_at, c.amount_cents, rf.cents,
         c.amount_cents - rf.cents, c.books, c.property_id
  FROM payments p
  CROSS JOIN LATERAL a1_classify_payment(p) c
  CROSS JOIN LATERAL (SELECT coalesce(sum(r.amount_cents), 0)::bigint AS cents FROM payment_refunds r
                      WHERE r.payment_id = p.id AND r.reversed_at IS NULL AND (r.refunded_at AT TIME ZONE 'America/New_York')::date <= p_as_of) rf
  WHERE (p_tenant IS NULL OR p.tenant_id = p_tenant)
    AND c.qualifies AND c.credit_code <> '2100' AND p.tenant_id IS NOT NULL
    AND a2_cutover() IS NOT NULL AND c.entry_date >= a2_cutover() AND c.entry_date <= p_as_of
    AND EXISTS (SELECT 1 FROM journal_entries je
                WHERE je.source_type = 'payment' AND je.source_id = p.id AND je.kind = 'post'
                  AND (je.signature->>'amount')::bigint = c.amount_cents
                  AND NOT EXISTS (SELECT 1 FROM journal_entries x WHERE x.reverses_entry_id = je.id))
  UNION ALL
  SELECT p.id, p.tenant_id, a2_cat(p.category), c.entry_date, p.created_at, c.amount_cents, 0::bigint, c.amount_cents, c.books, c.property_id
  FROM payments p
  JOIN payment_returns pr ON pr.payment_id = p.id
  CROSS JOIN LATERAL a1_classify_payment(a3_collected_row(p)) c
  WHERE (p_tenant IS NULL OR p.tenant_id = p_tenant)
    AND pr.returned_on > p_as_of
    AND c.qualifies AND c.credit_code <> '2100' AND p.tenant_id IS NOT NULL
    AND a2_cutover() IS NOT NULL AND c.entry_date >= a2_cutover() AND c.entry_date <= p_as_of;
$$;

CREATE OR REPLACE FUNCTION public.a2_receipts(p_as_of date)
RETURNS TABLE (payment_id uuid, tenant_id uuid, cat text, paid_on date, created_at timestamptz,
               gross_cents bigint, refunded_cents bigint, net_cents bigint, books uuid, property_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM a3_receipts(p_as_of, NULL);
$$;

-- Money a tenant can have applied: receipts the ledger recognises, and opening credits.
CREATE FUNCTION public.a3_sources(p_tenant uuid)
RETURNS TABLE (payment_id uuid, credit_charge_id uuid, tenant_id uuid, cat text, books uuid, property_id uuid,
               order_date date, effective_date date, created_at timestamptz, sort_id uuid, net_cents bigint,
               applies_from date, priority int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.payment_id, NULL::uuid, r.tenant_id, r.cat, r.books, r.property_id, r.paid_on, r.paid_on, r.created_at, r.payment_id, r.net_cents, NULL::date, 1
  FROM a3_receipts(DATE '9999-12-31', p_tenant) r
  UNION ALL
  SELECT NULL::uuid, tc.id, tc.tenant_id, a2_cat(tc.category), pr.accounting_entity_id, tc.property_id, tc.due_date, tc.charge_date, tc.created_at, tc.id, -tc.amount_cents,
         tc.applies_from, CASE WHEN tc.source = 'rental_credit' THEN 0 ELSE 1 END
  FROM tenant_charges tc LEFT JOIN properties pr ON pr.id = tc.property_id
  WHERE tc.tenant_id = p_tenant AND tc.amount_cents < 0 AND tc.voided_at IS NULL;
$$;

CREATE FUNCTION public.a3_source_applied(p_payment uuid, p_credit uuid) RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(sum(CASE a.kind WHEN 'apply' THEN a.amount_cents ELSE -a.amount_cents END), 0)::bigint
  FROM payment_applications a
  WHERE (p_payment IS NOT NULL AND a.payment_id = p_payment) OR (p_credit IS NOT NULL AND a.credit_charge_id = p_credit);
$$;

CREATE FUNCTION public.a3_charge_applied(p_charge uuid) RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(sum(CASE a.kind WHEN 'apply' THEN a.amount_cents ELSE -a.amount_cents END), 0)::bigint
  FROM payment_applications a WHERE a.charge_id = p_charge;
$$;

-- Append-only, and every new application obeys D5 no matter which code path wrote it.
CREATE FUNCTION public.a3_application_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c tenant_charges; o payment_applications; s record; v_books uuid; v_left bigint;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'A3: payment applications are append-only; correct with a reversal' USING ERRCODE = '42501';
  END IF;
  IF NEW.kind = 'reversal' THEN
    SELECT * INTO o FROM payment_applications WHERE id = NEW.reverses_id;
    IF o.id IS NULL OR o.kind <> 'apply' THEN RAISE EXCEPTION 'A3: a reversal must point at an application'; END IF;
    IF o.tenant_id <> NEW.tenant_id OR o.charge_id <> NEW.charge_id OR o.cat <> NEW.cat
       OR o.payment_id IS DISTINCT FROM NEW.payment_id OR o.credit_charge_id IS DISTINCT FROM NEW.credit_charge_id THEN
      RAISE EXCEPTION 'A3: a reversal must match the application it reverses';
    END IF;
    SELECT o.amount_cents - coalesce(sum(r.amount_cents), 0) INTO v_left FROM payment_applications r WHERE r.reverses_id = o.id;
    IF NEW.amount_cents > v_left THEN RAISE EXCEPTION 'A3: reversal (%) exceeds what remains of the application (%)', NEW.amount_cents, v_left; END IF;
    RETURN NEW;
  END IF;
  IF NEW.origin = 'migration' THEN RETURN NEW; END IF;   -- A2's results, carried forward once, as calculated

  SELECT * INTO c FROM tenant_charges WHERE id = NEW.charge_id;
  IF c.tenant_id <> NEW.tenant_id THEN RAISE EXCEPTION 'A3: the charge belongs to a different tenant'; END IF;
  IF a2_cat(c.category) <> NEW.cat THEN RAISE EXCEPTION 'A3: a % payment can only be applied to % charges (D5)', NEW.cat, NEW.cat; END IF;
  IF c.voided_at IS NOT NULL OR c.amount_cents <= 0 THEN RAISE EXCEPTION 'A3: the charge is void or a credit'; END IF;
  SELECT * INTO s FROM a3_sources(NEW.tenant_id) x
    WHERE (NEW.payment_id IS NOT NULL AND x.payment_id = NEW.payment_id) OR (NEW.credit_charge_id IS NOT NULL AND x.credit_charge_id = NEW.credit_charge_id);
  IF s.sort_id IS NULL THEN RAISE EXCEPTION 'A3: the payment is not in the ledger for this tenant, or the credit is void'; END IF;
  IF s.cat <> NEW.cat THEN RAISE EXCEPTION 'A3: a % payment can only be applied to % charges (D5)', s.cat, s.cat; END IF;
  IF s.applies_from IS NOT NULL AND c.due_date < s.applies_from THEN
    RAISE EXCEPTION 'A3: this rental credit applies to rent due from %', s.applies_from;
  END IF;
  SELECT pr.accounting_entity_id INTO v_books FROM properties pr WHERE pr.id = c.property_id;
  IF v_books IS NOT NULL AND s.books IS NOT NULL AND v_books <> s.books THEN
    RAISE EXCEPTION 'A3: the payment and the charge belong to different sets of books';
  END IF;
  IF NEW.amount_cents > s.net_cents - a3_source_applied(NEW.payment_id, NEW.credit_charge_id) THEN
    RAISE EXCEPTION 'A3: the payment has only % left to apply', s.net_cents - a3_source_applied(NEW.payment_id, NEW.credit_charge_id);
  END IF;
  IF NEW.amount_cents > c.amount_cents - a3_charge_applied(NEW.charge_id) THEN
    RAISE EXCEPTION 'A3: the charge has only % open', c.amount_cents - a3_charge_applied(NEW.charge_id);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER a3_application_guard BEFORE INSERT OR UPDATE OR DELETE ON public.payment_applications
  FOR EACH ROW EXECUTE FUNCTION public.a3_application_guard();
CREATE TRIGGER a3_applications_no_truncate BEFORE TRUNCATE ON public.payment_applications
  FOR EACH STATEMENT EXECUTE FUNCTION public.a3_application_guard();

CREATE FUNCTION public.a3_reverse(p_application uuid, p_amount bigint, p_effective date, p_origin text, p_event text, p_correction uuid DEFAULT NULL)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO payment_applications (kind, tenant_id, cat, payment_id, credit_charge_id, charge_id, amount_cents, effective_on, reverses_id, origin, event, correction_id)
  SELECT 'reversal', a.tenant_id, a.cat, a.payment_id, a.credit_charge_id, a.charge_id, p_amount, p_effective, a.id, p_origin, p_event, p_correction
  FROM payment_applications a WHERE a.id = p_application;
$$;

-- Bring one tenant's applications in line with their receipts and charges. Idempotent: with nothing changed it writes nothing.
--   1. Whatever is no longer valid (void charge, voided or reclassified receipt, void credit) is reversed.
--   2. A refund takes money back from the newest applications first, dated the refund date.
--   3. Unapplied money goes to open charges: same category, same books, oldest due first. Existing applications never move.
--      A rental credit goes first, and only to rent due on or after its stated date, so it never pays older arrears.
CREATE FUNCTION public.a3_reconcile_tenant(p_tenant uuid, p_event text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  x record; s record; c record; v_today date := a2_today(); v_excess bigint; v_take bigint; v_eff date; v_left bigint; v_open bigint; v_floor date;
BEGIN
  IF p_tenant IS NULL OR a2_cutover() IS NULL THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('a3_apply:' || p_tenant::text, 0));

  FOR x IN
    SELECT a.id, a.active_cents, ret.returned_on
    FROM a3_active_applications(p_tenant, DATE '9999-12-31') a
    JOIN tenant_charges tc ON tc.id = a.charge_id
    LEFT JOIN payment_returns ret ON ret.payment_id = a.payment_id
    LEFT JOIN a3_sources(p_tenant) src ON src.cat = a.cat
         AND (src.payment_id = a.payment_id OR src.credit_charge_id = a.credit_charge_id)
    WHERE tc.voided_at IS NOT NULL OR src.sort_id IS NULL
    ORDER BY a.seq DESC
  LOOP
    PERFORM a3_reverse(x.id, x.active_cents, coalesce(x.returned_on, v_today), 'automatic', p_event);
  END LOOP;

  FOR s IN SELECT * FROM a3_sources(p_tenant) LOOP
    v_excess := a3_source_applied(s.payment_id, s.credit_charge_id) - s.net_cents;
    CONTINUE WHEN v_excess <= 0;
    SELECT coalesce(max(a2_ny_date(f.refunded_at)), v_today) INTO v_eff FROM payment_refunds f WHERE f.payment_id = s.payment_id AND f.reversed_at IS NULL;
    FOR x IN
      SELECT a.id, a.active_cents FROM a3_active_applications(p_tenant, DATE '9999-12-31') a
      WHERE a.payment_id = s.payment_id OR a.credit_charge_id = s.credit_charge_id
      ORDER BY a.effective_on DESC, a.seq DESC
    LOOP
      EXIT WHEN v_excess <= 0;
      v_take := least(v_excess, x.active_cents);
      PERFORM a3_reverse(x.id, v_take, v_eff, 'automatic', p_event);
      v_excess := v_excess - v_take;
    END LOOP;
  END LOOP;

  FOR s IN SELECT * FROM a3_sources(p_tenant) ORDER BY priority, order_date, created_at, sort_id LOOP
    v_left := s.net_cents - a3_source_applied(s.payment_id, s.credit_charge_id);
    CONTINUE WHEN v_left <= 0;
    -- Money freed by a correction wasn't available before that correction's date.
    SELECT max(r.effective_on) INTO v_floor FROM payment_applications r
      WHERE r.kind = 'reversal' AND (r.payment_id = s.payment_id OR r.credit_charge_id = s.credit_charge_id);
    FOR c IN
      SELECT tc.id, tc.amount_cents, tc.charge_date, tc.due_date, pr.accounting_entity_id AS books
      FROM tenant_charges tc LEFT JOIN properties pr ON pr.id = tc.property_id
      WHERE tc.tenant_id = p_tenant AND a2_cat(tc.category) = s.cat AND tc.amount_cents > 0 AND tc.voided_at IS NULL
      ORDER BY tc.due_date, tc.created_at, tc.id
    LOOP
      EXIT WHEN v_left <= 0;
      CONTINUE WHEN c.books IS NOT NULL AND s.books IS NOT NULL AND c.books <> s.books;
      CONTINUE WHEN s.applies_from IS NOT NULL AND c.due_date < s.applies_from;
      v_open := c.amount_cents - a3_charge_applied(c.id);
      CONTINUE WHEN v_open <= 0;
      v_take := least(v_left, v_open);
      INSERT INTO payment_applications (kind, tenant_id, cat, payment_id, credit_charge_id, charge_id, amount_cents, effective_on, origin, event)
      VALUES ('apply', p_tenant, s.cat, s.payment_id, s.credit_charge_id, c.id, v_take,
              greatest(s.effective_date, c.charge_date, coalesce(v_floor, s.effective_date)), 'automatic', p_event);
      v_left := v_left - v_take;
    END LOOP;
  END LOOP;
END;
$$;

-- Replaces A2's calculation with the stored record. Same columns, so aging, the tenant ledger and reconciliation read it unchanged.
CREATE OR REPLACE FUNCTION public.a2_applications(p_as_of date, p_tenant uuid DEFAULT NULL)
RETURNS TABLE (tenant_id uuid, cat text, charge_id uuid, payment_id uuid, credit_charge_id uuid,
               credit_property_id uuid, amount_cents bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH src AS (
    SELECT r.tenant_id, r.cat, r.payment_id, NULL::uuid AS credit_charge_id, r.property_id, r.net_cents AS amt
    FROM a3_receipts(p_as_of, p_tenant) r WHERE r.net_cents > 0
    UNION ALL
    SELECT tc.tenant_id, a2_cat(tc.category), NULL::uuid, tc.id, tc.property_id, -tc.amount_cents
    FROM tenant_charges tc
    WHERE (p_tenant IS NULL OR tc.tenant_id = p_tenant) AND tc.amount_cents < 0 AND tc.charge_date <= p_as_of
      AND (tc.voided_at IS NULL OR a2_ny_date(tc.voided_at) > p_as_of)
  ), act AS (
    SELECT s.tenant_id, s.cat, a.charge_id, s.payment_id, s.credit_charge_id, s.property_id, a.active_cents, s.amt
    FROM a3_active_applications(p_tenant, p_as_of) a
    JOIN src s ON s.cat = a.cat AND s.tenant_id = a.tenant_id
              AND (s.payment_id = a.payment_id OR s.credit_charge_id = a.credit_charge_id)
  )
  SELECT act.tenant_id, act.cat, act.charge_id, act.payment_id, act.credit_charge_id, act.property_id, act.active_cents FROM act
  UNION ALL
  SELECT s.tenant_id, s.cat, NULL::uuid, s.payment_id, s.credit_charge_id, s.property_id,
         s.amt - coalesce((SELECT sum(x.active_cents) FROM act x
                           WHERE x.payment_id IS NOT DISTINCT FROM s.payment_id AND x.credit_charge_id IS NOT DISTINCT FROM s.credit_charge_id), 0)::bigint
  FROM src s
  WHERE s.amt > coalesce((SELECT sum(x.active_cents) FROM act x
                          WHERE x.payment_id IS NOT DISTINCT FROM s.payment_id AND x.credit_charge_id IS NOT DISTINCT FROM s.credit_charge_id), 0);
$$;

-- Where one payment's money stands now. "re_applied" means a person chose that allocation.
CREATE OR REPLACE FUNCTION public.a2_payment_applications(p_payment uuid)
RETURNS TABLE (applied_to text, category text, period text, due_date date, amount_cents bigint, charge_id uuid, re_applied boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN x.charge_id IS NULL THEN 'Credit on account' ELSE coalesce(tc.memo, tc.category || ' ' || tc.period, tc.category || ' charge') END,
         coalesce(tc.category, initcap(x.cat)), tc.period, tc.due_date, x.amount_cents, x.charge_id,
         EXISTS (SELECT 1 FROM payment_applications m WHERE m.payment_id = x.payment_id AND m.charge_id = x.charge_id AND m.kind = 'apply' AND m.origin = 'manual')
  FROM payments p
  CROSS JOIN LATERAL a2_applications(a2_today(), p.tenant_id) x
  LEFT JOIN tenant_charges tc ON tc.id = x.charge_id
  WHERE p.id = p_payment AND x.payment_id = p_payment AND a2_can_see_tenant(p.tenant_id)
  ORDER BY tc.due_date NULLS LAST;
$$;

-- A2's pins are superseded: the old table stays for history, and writes go through a3_reapply.
CREATE OR REPLACE FUNCTION public.a2_pin_application(p_payment uuid, p_charge uuid, p_amount_cents bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'A3: use a3_reapply; applications are now stored permanently'; END;
$$;
CREATE OR REPLACE FUNCTION public.a2_unpin_application(p_payment uuid, p_charge uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'A3: use a3_reverse_application; applications are now stored permanently'; END;
$$;

-- Keep applications current as receipts, refunds and charges change. Like A1's posting, a failure here is
-- recorded and never blocks the payment or charge itself. Trigger names sort after a1_ and a2_, so the
-- journal has already posted by the time these run.
CREATE FUNCTION public.a3_apply_safely(p_tenant uuid, p_event text, p_type text, p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    PERFORM a3_reconcile_tenant(p_tenant, p_event);
    UPDATE posting_exceptions SET resolved_at = now()
      WHERE source_type = p_type AND source_id = p_id AND code = 'application_failed' AND resolved_at IS NULL;
  EXCEPTION WHEN OTHERS THEN
    PERFORM a1_note(p_type, p_id, 'application_failed', 'error', left(SQLERRM, 500));
  END;
END;
$$;

CREATE FUNCTION public.a3_payment_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_event text; v uuid; v_pid uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
BEGIN
  BEGIN PERFORM a3_sync_modus_fee(v_pid);
  EXCEPTION WHEN OTHERS THEN PERFORM a1_note('payment', v_pid, 'modus_fee_failed', 'error', left(SQLERRM, 500)); END;
  IF TG_OP = 'DELETE' THEN
    PERFORM a3_apply_safely(OLD.tenant_id, 'Payment deleted', 'payment', OLD.id);
    RETURN NULL;
  END IF;
  v_event := CASE WHEN NEW.voided_at IS NOT NULL THEN 'Payment voided: ' || coalesce(NEW.void_reason, '')
                  WHEN lower(coalesce(NEW.status, '')) = 'returned' THEN 'Payment returned: ' || coalesce((SELECT r.reason FROM payment_returns r WHERE r.payment_id = NEW.id), 'recorded')
                  WHEN TG_OP = 'UPDATE' AND a2_cat(OLD.category) IS DISTINCT FROM a2_cat(NEW.category) THEN 'Payment reclassified'
                  WHEN lower(coalesce(NEW.status, '')) = 'paid' THEN 'Payment received'
                  ELSE 'Payment no longer in the ledger (' || coalesce(NEW.status, 'no status') || ')' END;
  IF TG_OP = 'UPDATE' AND OLD.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
    PERFORM a3_apply_safely(OLD.tenant_id, 'Payment moved to another tenant', 'payment', NEW.id);
  END IF;
  PERFORM a3_apply_safely(NEW.tenant_id, v_event, 'payment', NEW.id);
  -- A Stripe event that arrived before its payment posted can post now.
  FOR v IN SELECT e.id FROM stripe_fee_events e WHERE e.payment_id = NEW.id AND a1_active_entry('stripe_event', e.id) IS NULL LOOP
    BEGIN PERFORM a3_sync_stripe_event(v);
    EXCEPTION WHEN OTHERS THEN PERFORM a1_note('stripe_event', v, 'posting_failed', 'error', left(SQLERRM, 500)); END;
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE FUNCTION public.a3_refund_apply_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_t uuid;
BEGIN
  SELECT tenant_id INTO v_t FROM payments WHERE id = NEW.payment_id;
  PERFORM a3_apply_safely(v_t, CASE WHEN NEW.reversed_at IS NOT NULL THEN 'Refund reversed: ' || NEW.reversed_reason
                                    ELSE 'Refund: ' || coalesce(NEW.reason, 'recorded') END, 'refund', NEW.id);
  RETURN NULL;
END;
$$;

-- Setting or moving the cutover decides which offline rent carries the fee.
CREATE FUNCTION public.a3_settings_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid;
BEGIN
  FOR v IN SELECT id FROM payments WHERE lower(coalesce(status, '')) = 'paid' LOOP
    BEGIN PERFORM a3_sync_modus_fee(v);
    EXCEPTION WHEN OTHERS THEN PERFORM a1_note('payment', v, 'modus_fee_failed', 'error', left(SQLERRM, 500)); END;
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE FUNCTION public.a3_charge_apply_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM a3_apply_safely(NEW.tenant_id, CASE WHEN NEW.voided_at IS NOT NULL THEN 'Charge voided: ' || NEW.void_reason ELSE 'New charge' END, 'charge', NEW.id);
  RETURN NULL;
END;
$$;

-- Landlord re-application: put this payment's money on a chosen charge. Takes unapplied money first, then the
-- payment's newest other applications. The earlier rows stay, tied together by a correction id, with the reason.
CREATE FUNCTION public.a3_reapply(p_payment uuid, p_charge uuid, p_amount_cents bigint, p_reason text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p payments; c tenant_charges; s record; x record; v_corr uuid := gen_random_uuid(); v_free bigint; v_need bigint; v_take bigint; v_today date := a2_today();
BEGIN
  PERFORM a2_require_landlord();
  IF coalesce(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A3: a reason is required to re-apply a payment'; END IF;
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN RAISE EXCEPTION 'A3: amount must be greater than zero'; END IF;
  SELECT * INTO p FROM payments WHERE id = p_payment;
  SELECT * INTO c FROM tenant_charges WHERE id = p_charge;
  IF p.id IS NULL OR c.id IS NULL THEN RAISE EXCEPTION 'A3: payment or charge not found'; END IF;
  IF p.tenant_id IS DISTINCT FROM c.tenant_id THEN RAISE EXCEPTION 'A3: payment and charge belong to different tenants'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('a3_apply:' || p.tenant_id::text, 0));
  SELECT * INTO s FROM a3_sources(p.tenant_id) z WHERE z.payment_id = p_payment;
  IF s.sort_id IS NULL OR s.net_cents <= 0 THEN RAISE EXCEPTION 'A3: this payment has nothing left to apply (void, fully refunded, or not in the ledger)'; END IF;
  IF s.cat <> a2_cat(c.category) THEN RAISE EXCEPTION 'A3: a % payment can only be applied to % charges (reclassify the payment instead)', s.cat, s.cat; END IF;
  IF p_amount_cents > c.amount_cents - a3_charge_applied(p_charge) THEN
    RAISE EXCEPTION 'A3: that charge has only % open. Reverse an application on it first', c.amount_cents - a3_charge_applied(p_charge);
  END IF;
  IF p_amount_cents > s.net_cents - coalesce((SELECT sum(a.active_cents) FROM a3_active_applications(p.tenant_id, DATE '9999-12-31') a WHERE a.payment_id = p_payment AND a.charge_id = p_charge), 0) THEN
    RAISE EXCEPTION 'A3: the payment does not have that much available to move';
  END IF;
  v_free := s.net_cents - a3_source_applied(p_payment, NULL);
  v_need := p_amount_cents - v_free;
  IF v_need > 0 THEN
    FOR x IN SELECT a.id, a.active_cents FROM a3_active_applications(p.tenant_id, DATE '9999-12-31') a
             WHERE a.payment_id = p_payment AND a.charge_id <> p_charge ORDER BY a.effective_on DESC, a.seq DESC
    LOOP
      EXIT WHEN v_need <= 0;
      v_take := least(v_need, x.active_cents);
      PERFORM a3_reverse(x.id, v_take, v_today, 'manual', btrim(p_reason), v_corr);
      v_need := v_need - v_take;
    END LOOP;
  END IF;
  INSERT INTO payment_applications (kind, tenant_id, cat, payment_id, charge_id, amount_cents, effective_on, origin, event, correction_id)
  VALUES ('apply', p.tenant_id, s.cat, p_payment, p_charge, p_amount_cents, greatest(s.effective_date, c.charge_date, v_today), 'manual', btrim(p_reason), v_corr);
  PERFORM a3_reconcile_tenant(p.tenant_id, 'Re-application: ' || btrim(p_reason));
  RETURN v_corr;
END;
$$;

-- Take back one application. The money returns to the standard order (oldest open charge, or credit).
CREATE FUNCTION public.a3_reverse_application(p_application uuid, p_reason text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a record; v_corr uuid := gen_random_uuid(); v_t uuid;
BEGIN
  PERFORM a2_require_landlord();
  IF coalesce(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A3: a reason is required to reverse an application'; END IF;
  SELECT tenant_id INTO v_t FROM payment_applications WHERE id = p_application;
  IF v_t IS NULL THEN RAISE EXCEPTION 'A3: application not found'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('a3_apply:' || v_t::text, 0));
  SELECT * INTO a FROM a3_active_applications(v_t, DATE '9999-12-31') z WHERE z.id = p_application;
  IF a.id IS NULL THEN RAISE EXCEPTION 'A3: this application is already fully reversed'; END IF;
  PERFORM a3_reverse(a.id, a.active_cents, a2_today(), 'manual', btrim(p_reason), v_corr);
  PERFORM a3_reconcile_tenant(v_t, 'After reversal: ' || btrim(p_reason));
  RETURN v_corr;
END;
$$;

-- The full record for a tenant or one payment, oldest first (landlord).
CREATE FUNCTION public.a3_application_history(p_tenant uuid, p_payment uuid DEFAULT NULL)
RETURNS TABLE (id uuid, seq bigint, kind text, cat text, payment_id uuid, credit_charge_id uuid, charge_id uuid, charge_label text, due_date date,
               amount_cents bigint, effective_on date, origin text, event text, correction_id uuid, recorded_at timestamptz, recorded_by text,
               reverses_id uuid, active_cents bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.seq, a.kind, a.cat, a.payment_id, a.credit_charge_id, a.charge_id,
         coalesce(tc.memo, tc.category || ' ' || tc.period, tc.category || ' charge'), tc.due_date, a.amount_cents, a.effective_on, a.origin, a.event, a.correction_id, a.created_at,
         coalesce(to_jsonb(pf) ->> 'full_name', to_jsonb(pf) ->> 'name', to_jsonb(pf) ->> 'email', CASE WHEN a.created_by IS NULL THEN 'Modus' ELSE a.created_by::text END),
         a.reverses_id,
         CASE WHEN a.kind = 'apply' THEN coalesce((SELECT z.active_cents FROM a3_active_applications(a.tenant_id, DATE '9999-12-31') z WHERE z.id = a.id), 0) END
  FROM payment_applications a
  JOIN tenant_charges tc ON tc.id = a.charge_id
  LEFT JOIN profiles pf ON pf.id = a.created_by
  WHERE is_landlord() AND a.tenant_id = p_tenant AND (p_payment IS NULL OR a.payment_id = p_payment)
  ORDER BY a.seq;
$$;

-- Standing checks shown on the Receivables screen. An empty result means the stored record is sound.
CREATE FUNCTION public.a3_application_check()
RETURNS TABLE (tenant_id uuid, tenant_name text, problem text, detail text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH t AS (SELECT DISTINCT x.t FROM (SELECT a.tenant_id t FROM payment_applications a UNION SELECT tc.tenant_id FROM tenant_charges tc) x),
  s AS (SELECT y.*, a3_source_applied(y.payment_id, y.credit_charge_id) applied FROM t CROSS JOIN LATERAL a3_sources(t.t) y),
  c AS (SELECT tc.*, a3_charge_applied(tc.id) applied, pr.accounting_entity_id books FROM tenant_charges tc LEFT JOIN properties pr ON pr.id = tc.property_id WHERE tc.amount_cents > 0)
  SELECT z.tenant_id, tn.name, z.problem, z.detail FROM (
    SELECT s.tenant_id, 'payment_over_applied' problem, concat_ws(' ', s.cat, 'applied', s.applied, 'of', s.net_cents) detail FROM s WHERE s.applied > s.net_cents
    UNION ALL SELECT c.tenant_id, 'charge_over_applied', concat_ws(' ', c.category, 'applied', c.applied, 'of', c.amount_cents) FROM c WHERE c.applied > c.amount_cents
    UNION ALL SELECT c.tenant_id, 'void_charge_applied', concat_ws(' ', c.category, 'applied', c.applied) FROM c WHERE c.voided_at IS NOT NULL AND c.applied > 0
    UNION ALL SELECT s.tenant_id, 'money_unapplied_with_open_charge', concat_ws(' ', s.cat, s.net_cents - s.applied, 'unapplied')
      FROM s WHERE s.net_cents > s.applied AND EXISTS (SELECT 1 FROM c WHERE c.tenant_id = s.tenant_id AND a2_cat(c.category) = s.cat AND c.voided_at IS NULL AND c.amount_cents > c.applied
                                                         AND (c.books IS NULL OR s.books IS NULL OR c.books = s.books)
                                                         AND (s.applies_from IS NULL OR c.due_date >= s.applies_from))
    UNION ALL SELECT a.tenant_id, 'source_not_in_ledger', concat_ws(' ', a.cat, a.active_cents) FROM a3_active_applications(NULL, DATE '9999-12-31') a
      WHERE a.origin <> 'migration' AND NOT EXISTS (SELECT 1 FROM s WHERE s.cat = a.cat AND (s.payment_id = a.payment_id OR s.credit_charge_id = a.credit_charge_id))
  ) z LEFT JOIN tenants tn ON tn.id = z.tenant_id
  WHERE is_landlord()
  ORDER BY 2, 3;
$$;


-- The tenant ledger, with rental credits and returned payments as their own lines. Everything else is A2's.
CREATE OR REPLACE FUNCTION public.a2_tenant_ledger(p_tenant uuid DEFAULT NULL)
RETURNS TABLE (seq bigint, event_date date, kind text, category text, description text,
               charge_cents bigint, payment_cents bigint, balance_cents bigint, ref_id uuid, status text, open_cents bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
#variable_conflict use_column
DECLARE v_t uuid := p_tenant; v_today date := a2_today();
BEGIN
  IF v_t IS NULL THEN SELECT t.id INTO v_t FROM tenants t WHERE t.user_id = auth.uid() ORDER BY t.created_at DESC NULLS LAST LIMIT 1; END IF;
  IF v_t IS NULL OR a2_cutover() IS NULL OR NOT a2_can_see_tenant(v_t) THEN RETURN; END IF;
  RETURN QUERY
  WITH oc AS (SELECT * FROM a2_open_charges_internal(v_today, v_t)),
  ev AS (
    SELECT tc.charge_date d, 1 o, tc.created_at ca,
           CASE tc.source WHEN 'opening_balance' THEN 'opening' WHEN 'late_fee' THEN 'late_fee' WHEN 'rental_credit' THEN 'rental_credit' ELSE 'charge' END k,
           tc.category cg,
           concat_ws(' · ', CASE tc.source WHEN 'opening_balance' THEN 'Opening balance' WHEN 'schedule' THEN tc.category || ' ' || tc.period
                                           WHEN 'late_fee' THEN 'Late fee' WHEN 'rental_credit' THEN 'Rental credit' ELSE tc.category END, tc.memo,
                     CASE WHEN tc.source = 'rental_credit' THEN 'for rent due from ' || to_char(tc.applies_from, 'YYYY-MM-DD') END,
                     CASE WHEN tc.voided_at IS NOT NULL THEN 'VOID: ' || tc.void_reason END) ds,
           CASE WHEN tc.voided_at IS NOT NULL THEN 0 WHEN tc.amount_cents > 0 OR tc.source = 'rental_credit' THEN tc.amount_cents ELSE 0 END ch,
           CASE WHEN tc.voided_at IS NULL AND tc.amount_cents < 0 AND tc.source <> 'rental_credit' THEN -tc.amount_cents ELSE 0 END py,
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
                          ELSE concat_ws(' ', 'Recorded offline', '(' || nullif(coalesce(p.method, p.source), '') || ')') END), 0, r.gross_cents, r.payment_id, 'received', NULL
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
    UNION ALL
    -- A returned payment: it was collected, then it came back. Two lines, so neither fact is lost.
    SELECT (p.paid_at AT TIME ZONE 'America/New_York')::date, 2, p.created_at, 'returned_payment', p.category,
           concat_ws(' · ', 'Payment', p.category, CASE WHEN p.stripe_payment_intent_id IS NOT NULL THEN 'Stripe' ELSE 'Recorded offline' END),
           0::bigint, pr.amount_cents, p.id, 'returned', NULL::bigint
    FROM payment_returns pr JOIN payments p ON p.id = pr.payment_id
    WHERE p.tenant_id = v_t AND pr.returned_on <= v_today AND (p.paid_at AT TIME ZONE 'America/New_York')::date >= a2_cutover()
    UNION ALL
    SELECT pr.returned_on, 3, pr.created_at, 'return', p.category, concat_ws(' · ', 'Payment returned', pr.reason),
           pr.amount_cents, 0::bigint, pr.id, 'returned', NULL::bigint
    FROM payment_returns pr JOIN payments p ON p.id = pr.payment_id
    WHERE p.tenant_id = v_t AND pr.returned_on <= v_today AND (p.paid_at AT TIME ZONE 'America/New_York')::date >= a2_cutover()
  )
  SELECT row_number() OVER w, ev.d, ev.k, ev.cg, ev.ds, ev.ch::bigint, ev.py::bigint,
         sum(ev.ch - ev.py) OVER (ORDER BY ev.d, ev.o, ev.ca, ev.rid ROWS UNBOUNDED PRECEDING)::bigint,
         ev.rid, ev.st, ev.op
  FROM ev WINDOW w AS (ORDER BY ev.d, ev.o, ev.ca, ev.rid)
  ORDER BY ev.d, ev.o, ev.ca, ev.rid;
END;
$fn$;

-- A rental credit: no cash moved, so nothing posts. It lowers the rent the tenant owes from a stated month on.
-- Whatever the tenant then pays is the collection, and only that is split 95% / 5%.
CREATE FUNCTION public.a3_issue_rental_credit(p_tenant uuid, p_amount_cents bigint, p_reason text, p_applies_from date DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_unit uuid; v_prop uuid; v_id uuid; v_today date := a2_today(); v_from date;
BEGIN
  PERFORM a2_require_landlord();
  PERFORM a2_require_active();
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN RAISE EXCEPTION 'A3: a rental credit must be greater than zero'; END IF;
  IF coalesce(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A3: a reason is required for a rental credit'; END IF;
  SELECT t.unit_id, u.property_id INTO v_unit, v_prop FROM tenants t LEFT JOIN units u ON u.id = t.unit_id WHERE t.id = p_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'A3: tenant not found'; END IF;
  v_from := coalesce(p_applies_from, (date_trunc('month', v_today) + interval '1 month')::date);
  -- Next month's rent or later, so a credit can never be aimed at rent already due and settle arrears.
  IF v_from < (date_trunc('month', v_today) + interval '1 month')::date THEN
    RAISE EXCEPTION 'A3: a rental credit applies to next month''s rent or later';
  END IF;
  INSERT INTO tenant_charges (tenant_id, unit_id, property_id, category, amount_cents, charge_date, due_date, source, memo, applies_from)
  VALUES (p_tenant, v_unit, v_prop, 'Rent', -p_amount_cents, v_today, v_from, 'rental_credit', btrim(p_reason), v_from)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- What's unapplied on a tenant's account, by kind. A cash overpayment and a rental credit are different things:
-- the first was collected and its 5% taken; the second was never money.
CREATE FUNCTION public.a3_credit_breakdown(p_as_of date DEFAULT NULL, p_tenant uuid DEFAULT NULL)
RETURNS TABLE (tenant_id uuid, cash_overpayment_cents bigint, rental_credit_cents bigint, opening_credit_cents bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.tenant_id,
         coalesce(sum(a.amount_cents) FILTER (WHERE a.payment_id IS NOT NULL), 0)::bigint,
         coalesce(sum(a.amount_cents) FILTER (WHERE tc.source = 'rental_credit'), 0)::bigint,
         coalesce(sum(a.amount_cents) FILTER (WHERE tc.source = 'opening_balance'), 0)::bigint
  FROM a2_applications(coalesce(p_as_of, a2_today()), p_tenant) a
  LEFT JOIN tenant_charges tc ON tc.id = a.credit_charge_id
  WHERE a.charge_id IS NULL AND (is_landlord() OR (p_tenant IS NOT NULL AND a2_can_see_tenant(p_tenant)))
  GROUP BY a.tenant_id;
$$;

-- For Pay Rent: rental credit against this month's rent, applied or waiting. p_tenant NULL = the caller's own record.
CREATE FUNCTION public.a3_rent_credit_this_month(p_tenant uuid DEFAULT NULL) RETURNS bigint
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_t uuid := p_tenant; v_first date := date_trunc('month', a2_today())::date; v_n bigint;
BEGIN
  IF v_t IS NULL THEN SELECT t.id INTO v_t FROM tenants t WHERE t.user_id = auth.uid() ORDER BY t.created_at DESC NULLS LAST LIMIT 1; END IF;
  IF v_t IS NULL OR a2_cutover() IS NULL OR NOT a2_can_see_tenant(v_t) THEN RETURN 0; END IF;
  SELECT coalesce(sum(-tc.amount_cents - used.cents), 0) INTO v_n
  FROM tenant_charges tc
  CROSS JOIN LATERAL (SELECT coalesce(sum(a.active_cents), 0)::bigint AS cents
                      FROM a3_active_applications(v_t, DATE '9999-12-31') a JOIN tenant_charges ch ON ch.id = a.charge_id
                      WHERE a.credit_charge_id = tc.id AND ch.due_date < v_first) used
  WHERE tc.tenant_id = v_t AND tc.source = 'rental_credit' AND tc.voided_at IS NULL AND tc.applies_from <= (v_first + interval '1 month' - interval '1 day')::date;
  RETURN v_n;
END;
$$;

-- What Pay Rent may collect, from the tenant's ledger and nothing else. Open charges are already net of payments and applied credits.
--   Payable = open Rent due by today, less Stripe rent still settling (same 14-day window as A2's late-fee deferral).
--   Other categories are listed, never added: a Stripe Pay Rent payment is always Rent (D5), and each charge keeps its own category.
--   Credit waiting for a later month doesn't reduce today's amount: the engine applies it when that month's charge exists.
-- Internal: the payment function calls this with the service role. Tenants read it through a3_pay_rent_due.
CREATE FUNCTION public.a3_pay_rent_internal(p_tenant uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_today date := a2_today(); v_first date := date_trunc('month', a2_today())::date;
        v_lines jsonb; v_other jsonb; v_open bigint; v_past bigint; v_pending bigint; v_applied bigint; v_waiting bigint;
BEGIN
  IF a2_cutover() IS NULL THEN RETURN jsonb_build_object('ledger_active', false); END IF;
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
    JOIN tenant_charges cr ON cr.id = a.credit_charge_id AND cr.source = 'rental_credit'
    JOIN tenant_charges ch ON ch.id = a.charge_id
    WHERE ch.due_date >= v_first AND ch.due_date <= v_today;
  SELECT coalesce(sum(a.amount_cents), 0)::bigint INTO v_waiting
    FROM a2_applications(v_today, p_tenant) a
    WHERE a.charge_id IS NULL AND a.cat = 'rent';
  RETURN jsonb_build_object('ledger_active', true, 'open_rent_cents', v_open, 'past_due_cents', v_past, 'pending_cents', v_pending,
                            'payable_cents', greatest(v_open - v_pending, 0), 'rent_lines', v_lines, 'other_lines', v_other,
                            'credit_applied_cents', v_applied, 'credit_waiting_cents', v_waiting);
END;
$$;

-- The same figures for the Pay Rent screen. p_tenant NULL = the caller's own record.
CREATE FUNCTION public.a3_pay_rent_due(p_tenant uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_t uuid := p_tenant;
BEGIN
  IF v_t IS NULL THEN SELECT t.id INTO v_t FROM tenants t WHERE t.user_id = auth.uid() ORDER BY t.created_at DESC NULLS LAST LIMIT 1; END IF;
  IF v_t IS NULL OR NOT a2_can_see_tenant(v_t) THEN RAISE EXCEPTION 'A3: not authorized for this tenant'; END IF;
  RETURN a3_pay_rent_internal(v_t);
END;
$$;


-- ============================================================
-- PART 3: Modus's 5%, returned payments, and refunds
-- ============================================================
-- Modus's 5% on one payment. withheld: A1 already posted it as the fee on a Stripe destination charge.
-- accrued: rent collected any other way, from the cutover on, owed by the owner.
CREATE FUNCTION public.a3_fee_parts(p payments, OUT withheld_cents bigint, OUT accrued_cents bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c record;
BEGIN
  withheld_cents := 0; accrued_cents := 0;
  SELECT * INTO c FROM a1_classify_payment(a3_collected_row(p));
  IF NOT coalesce(c.qualifies, false) THEN RETURN; END IF;
  withheld_cents := coalesce(c.fee_cents, 0);
  IF a2_cat(p.category) = 'rent' AND a2_cutover() IS NOT NULL AND c.entry_date >= a2_cutover() THEN
    accrued_cents := greatest(round(c.amount_cents * 0.05)::bigint - withheld_cents, 0);
  END IF;
END;
$$;

-- Post, or reverse, the fee owed on one payment. Same reverse-and-repost pattern as a1_sync.
CREATE FUNCTION public.a3_sync_modus_fee(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p payments; c record; a journal_entries; v_fee bigint := 0; v_sig jsonb; v_ver int; v_entry uuid; v_dr uuid; v_cr uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('modus_fee:' || p_id::text, 0));
  a := a1_active_entry('modus_fee', p_id);
  SELECT * INTO p FROM payments WHERE id = p_id;
  SELECT * INTO c FROM a1_classify_payment(p);
  IF coalesce(c.qualifies, false) THEN v_fee := (a3_fee_parts(p)).accrued_cents; END IF;
  IF v_fee > 0 THEN
    v_sig := jsonb_build_object('amount', v_fee, 'date', c.entry_date, 'books', c.books, 'property', c.property_id, 'unit', c.unit_id, 'tenant', p.tenant_id);
    IF a.id IS NOT NULL AND a.signature = v_sig THEN RETURN; END IF;
  END IF;
  IF a.id IS NOT NULL THEN PERFORM a1_reverse_entry(a.id, 'Reversal: Modus fee no longer owed on this payment'); END IF;
  IF v_fee = 0 THEN RETURN; END IF;
  SELECT id INTO v_dr FROM gl_accounts WHERE accounting_entity_id = c.books AND code = '6100';
  SELECT id INTO v_cr FROM gl_accounts WHERE accounting_entity_id = c.books AND code = '2195';
  IF v_dr IS NULL OR v_cr IS NULL THEN RAISE EXCEPTION 'A3: chart of accounts incomplete for books %', c.books; END IF;
  SELECT coalesce(max(source_version), 0) + 1 INTO v_ver FROM journal_entries WHERE source_type = 'modus_fee' AND source_id = p_id;
  INSERT INTO journal_entries (accounting_entity_id, entry_date, memo, source_type, source_id, source_version, kind, signature)
  VALUES (c.books, c.entry_date, 'Modus 5% on rent collected', 'modus_fee', p_id, v_ver, 'post', v_sig)
  RETURNING id INTO v_entry;
  INSERT INTO journal_lines (journal_entry_id, account_id, debit_cents, credit_cents, property_id, unit_id, tenant_id)
  SELECT v_entry, x.acct, x.dr, x.cr, c.property_id, c.unit_id, p.tenant_id
  FROM (VALUES (v_dr, v_fee, 0::bigint), (v_cr, 0::bigint, v_fee)) AS x(acct, dr, cr);
END;
$$;

-- A refund's share of the 5%, with cumulative rounding so the shares always add up to the fee.
CREATE FUNCTION public.a3_refund_fee_shares(p_refund uuid, OUT withheld_cents bigint, OUT accrued_cents bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r payment_refunds; p payments; f record; v_gross bigint; v_prev bigint;
BEGIN
  withheld_cents := 0; accrued_cents := 0;
  SELECT * INTO r FROM payment_refunds WHERE id = p_refund;
  SELECT * INTO p FROM payments WHERE id = r.payment_id;
  SELECT * INTO f FROM a3_fee_parts(p);
  v_gross := coalesce(p.amount_cents, round(p.amount * 100)::bigint, 0);
  IF v_gross = 0 THEN RETURN; END IF;
  SELECT coalesce(sum(x.amount_cents), 0) INTO v_prev FROM payment_refunds x
    WHERE x.payment_id = r.payment_id AND x.reversed_at IS NULL AND (x.created_at, x.id) < (r.created_at, r.id);
  withheld_cents := round(f.withheld_cents::numeric * (v_prev + r.amount_cents) / v_gross)::bigint - round(f.withheld_cents::numeric * v_prev / v_gross)::bigint;
  accrued_cents  := round(f.accrued_cents::numeric  * (v_prev + r.amount_cents) / v_gross)::bigint - round(f.accrued_cents::numeric  * v_prev / v_gross)::bigint;
END;
$$;

CREATE FUNCTION public.a3_return_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p payments; c record;
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'A3: payment returns are append-only' USING ERRCODE = '42501'; END IF;
  SELECT * INTO p FROM payments WHERE id = NEW.payment_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM payment_returns x WHERE x.payment_id = NEW.payment_id) THEN RETURN NULL; END IF;   -- a redelivered event
  SELECT * INTO c FROM a1_classify_payment(p);
  IF NOT coalesce(c.qualifies, false) THEN RAISE EXCEPTION 'A3: only a collected payment can be returned (%)', coalesce(c.err, c.excluded_reason, 'unknown'); END IF;
  IF NEW.amount_cents <> c.amount_cents THEN RAISE EXCEPTION 'A3: a returned amount (%) must equal the payment (%): ACH returns are full', NEW.amount_cents, c.amount_cents; END IF;
  IF NEW.returned_on < c.entry_date THEN RAISE EXCEPTION 'A3: a return cannot be dated before the payment (%)', c.entry_date; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER a3_return_guard BEFORE INSERT OR UPDATE OR DELETE ON public.payment_returns
  FOR EACH ROW EXECUTE FUNCTION public.a3_return_guard();

-- After a return: A1 has reversed the receipt, including the 95% in cash and the 5%. On a destination charge the owner
-- still holds the money, because Stripe doesn't reverse the transfer, so cash is restored and the amount shown as owed.
CREATE FUNCTION public.a3_sync_return(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r payment_returns; p payments; c record; v_owed bigint; v_entry uuid; v_cash uuid; v_due uuid;
BEGIN
  IF (a1_active_entry('payment_return', p_id)).id IS NOT NULL THEN RETURN; END IF;
  SELECT * INTO r FROM payment_returns WHERE id = p_id;
  SELECT * INTO p FROM payments WHERE id = r.payment_id;
  IF a3_payment_arrangement(p) NOT IN ('destination','unconfirmed') THEN RETURN; END IF;
  SELECT * INTO c FROM a1_classify_payment(a3_collected_row(p));
  v_owed := c.amount_cents - coalesce(c.fee_cents, 0);
  IF v_owed <= 0 THEN RETURN; END IF;
  SELECT id INTO v_cash FROM gl_accounts WHERE accounting_entity_id = c.books AND code = '1050';
  SELECT id INTO v_due  FROM gl_accounts WHERE accounting_entity_id = c.books AND code = '2190';
  INSERT INTO journal_entries (accounting_entity_id, entry_date, memo, source_type, source_id, source_version, kind, signature)
  VALUES (c.books, r.returned_on, 'Returned payment · owner holds the funds until the transfer is reversed', 'payment_return', p_id, 1, 'post',
          jsonb_build_object('amount', v_owed, 'date', r.returned_on, 'books', c.books, 'debit', '1050', 'credit', '2190'))
  RETURNING id INTO v_entry;
  INSERT INTO journal_lines (journal_entry_id, account_id, debit_cents, credit_cents, property_id, unit_id, tenant_id)
  SELECT v_entry, x.acct, x.dr, x.cr, c.property_id, c.unit_id, p.tenant_id
  FROM (VALUES (v_cash, v_owed, 0::bigint), (v_due, 0::bigint, v_owed)) AS x(acct, dr, cr);
END;
$$;

CREATE FUNCTION public.a3_return_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_t uuid; x record;
BEGIN
  -- Leaving 'paid' makes A1 reverse the receipt and the triggers below reverse applications and the accrued fee.
  UPDATE payments SET status = 'returned' WHERE id = NEW.payment_id RETURNING tenant_id INTO v_t;
  PERFORM a3_sync_return(NEW.id);
  -- D9: a failed payment's rent is eligible at the next run, not next month. A return is logged the same way a deferral is.
  FOR x IN
    SELECT DISTINCT tc.id, tc.due_date, tc.amount_cents - a3_charge_applied(tc.id) AS open_c
    FROM payment_applications a JOIN tenant_charges tc ON tc.id = a.charge_id
    WHERE a.payment_id = NEW.payment_id AND a2_cat(tc.category) = 'rent' AND tc.source <> 'opening_balance' AND tc.voided_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM tenant_charges fee WHERE fee.source = 'late_fee' AND fee.rent_charge_id = tc.id)
      AND tc.amount_cents > a3_charge_applied(tc.id)
  LOOP
    INSERT INTO a2_late_fee_audit (run_id, as_of, actor, tenant_id, rent_charge_id, rent_due_date, rent_open_cents, outcome)
    VALUES (gen_random_uuid(), NEW.returned_on, 'system', v_t, x.id, x.due_date, x.open_c, 'deferred: payment returned');
  END LOOP;
  RETURN NULL;
END;
$$;
CREATE TRIGGER a3_apply_returns AFTER INSERT ON public.payment_returns
  FOR EACH ROW EXECUTE FUNCTION public.a3_return_trigger();

-- Offline only: a returned check. A voided payment means "entered in error"; a returned one was collected, then came back.
-- Stripe returns arrive from the webhook.
CREATE FUNCTION public.a3_record_payment_return(p_payment uuid, p_returned_on date, p_reason text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p payments; v_id uuid;
BEGIN
  PERFORM a2_require_landlord();
  SELECT * INTO p FROM payments WHERE id = p_payment;
  IF NOT FOUND THEN RAISE EXCEPTION 'A3: payment not found'; END IF;
  IF p.stripe_payment_intent_id IS NOT NULL THEN RAISE EXCEPTION 'A3: Stripe reports its own returns'; END IF;
  IF p_returned_on IS NULL THEN RAISE EXCEPTION 'A3: enter the date the payment came back'; END IF;
  IF coalesce(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A3: a reason is required'; END IF;
  IF EXISTS (SELECT 1 FROM payment_refunds f WHERE f.payment_id = p_payment AND f.reversed_at IS NULL) THEN RAISE EXCEPTION 'A3: this payment has a refund recorded; reverse it first'; END IF;
  INSERT INTO payment_returns (payment_id, kind, amount_cents, returned_on, reason)
  VALUES (p_payment, 'offline_return', coalesce(p.amount_cents, round(p.amount * 100)::bigint), p_returned_on, btrim(p_reason))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- What the ORIGINAL charge did with the money. Evidence only; a transfer reversal is itself proof funds were transferred.
CREATE FUNCTION public.a3_payment_arrangement(p payments) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN p.stripe_payment_intent_id IS NULL THEN 'offline'
              WHEN p.stripe_transfer_destination IS NOT NULL OR p.stripe_transfer_id IS NOT NULL
                OR EXISTS (SELECT 1 FROM stripe_fee_events e WHERE e.payment_id = p.id AND e.kind = 'transfer_reversal') THEN 'destination'
              WHEN to_jsonb(p) ->> 'owner_stripe_account' IS NOT NULL THEN 'unconfirmed'
              ELSE 'platform_only' END;
$$;

-- A refund reverses the original income and its share of Modus's 5% on the refund date.
--   Destination charge (or arrangement unconfirmed): the 95% credits 2190. Stripe took the refund from Modus's balance, so the owner
--   owes that 95% until a transfer reversal clears it. The 5% credits the fee: Modus doesn't keep its fee on refunded rent.
--   Offline, or a charge that stayed on the platform account: the whole refund comes out of the cash account the receipt went into,
--   and any accrued 5% comes off what the owner owes Modus.
-- Same reverse-and-repost pattern and signature check as a1_sync.
CREATE OR REPLACE FUNCTION public.a2_sync_refund(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r payment_refunds; p payments; c record; sh record; a journal_entries; v_sig jsonb; v_ver int; v_entry uuid;
        v_dr uuid; v_cr uuid; v_fee uuid; v_pay uuid; v_date date; v_arr text; v_credit text;
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
  v_arr := a3_payment_arrangement(p);
  v_credit := CASE WHEN v_arr IN ('destination','unconfirmed') THEN '2190' ELSE c.debit_code END;
  v_date := a2_ny_date(r.refunded_at);
  SELECT * INTO sh FROM a3_refund_fee_shares(p_id);
  v_sig := jsonb_build_object('amount', r.amount_cents, 'date', v_date, 'books', c.books, 'debit', c.credit_code,
                              'credit', v_credit, 'property', c.property_id, 'unit', c.unit_id, 'tenant', p.tenant_id,
                              'fee_withheld', sh.withheld_cents, 'fee_accrued', sh.accrued_cents);
  IF a.id IS NOT NULL AND a.signature = v_sig THEN PERFORM a1_resolve_others('refund', p_id, '{}'); RETURN; END IF;
  IF a.id IS NOT NULL THEN PERFORM a1_reverse_entry(a.id, 'Reversal: refund changed'); END IF;

  SELECT id INTO v_dr FROM gl_accounts WHERE accounting_entity_id = c.books AND code = c.credit_code;
  SELECT id INTO v_cr FROM gl_accounts WHERE accounting_entity_id = c.books AND code = v_credit;
  SELECT id INTO v_fee FROM gl_accounts WHERE accounting_entity_id = c.books AND code = '6100';
  SELECT id INTO v_pay FROM gl_accounts WHERE accounting_entity_id = c.books AND code = '2195';
  IF v_dr IS NULL OR v_cr IS NULL OR v_fee IS NULL OR v_pay IS NULL THEN RAISE EXCEPTION 'A3: chart of accounts incomplete for books %', c.books; END IF;
  SELECT coalesce(max(source_version), 0) + 1 INTO v_ver FROM journal_entries WHERE source_type = 'refund' AND source_id = p_id;
  INSERT INTO journal_entries (accounting_entity_id, entry_date, memo, source_type, source_id, source_version, kind, signature)
  VALUES (c.books, v_date, concat_ws(' · ', 'Refund', nullif(btrim(p.category), ''), nullif(btrim(r.reason), '')), 'refund', p_id, v_ver, 'post', v_sig)
  RETURNING id INTO v_entry;
  INSERT INTO journal_lines (journal_entry_id, account_id, debit_cents, credit_cents, property_id, unit_id, tenant_id)
  SELECT v_entry, x.acct, x.dr, x.cr, c.property_id, c.unit_id, p.tenant_id
  FROM (VALUES (v_dr, r.amount_cents, 0::bigint),
               (v_cr, 0::bigint, r.amount_cents - sh.withheld_cents),
               (v_fee, 0::bigint, sh.withheld_cents + sh.accrued_cents),
               (v_pay, sh.accrued_cents, 0::bigint)) AS x(acct, dr, cr)
  WHERE x.dr > 0 OR x.cr > 0;
  PERFORM a1_resolve_others('refund', p_id, '{}');
END;
$$;

-- What Stripe actually did with the owner's money, each posted once, dated when it happened:
--   transfer_reversal       the owner gave money back:          Dr 2190 / Cr 1050
--   application_fee_refund  Modus's fee was pushed to the owner: Dr 1050 / Cr 2190
-- So 2190 per payment = the owner's 95% − reversals + fee refunds, whichever way Stripe moved the money. Zero is complete.
-- Stripe's own fee, its reversals, and return or dispute fees never post to owner books.
CREATE FUNCTION public.a3_sync_stripe_event(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e stripe_fee_events; p payments; c record; v_dr text; v_cr text; v_entry uuid; v_ver int; v_date date; v_memo text; v_dr_id uuid; v_cr_id uuid;
BEGIN
  SELECT * INTO e FROM stripe_fee_events WHERE id = p_id;
  IF e.id IS NULL OR e.kind NOT IN ('transfer_reversal','application_fee_refund') THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('stripe_event:' || p_id::text, 0));
  IF (a1_active_entry('stripe_event', p_id)).id IS NOT NULL THEN RETURN; END IF;
  SELECT * INTO p FROM payments WHERE id = e.payment_id;
  -- A failure before settlement never posted, and Stripe has already put everything back: nothing to do and nothing to flag.
  IF lower(coalesce(p.status, '')) = 'failed' THEN RETURN; END IF;
  SELECT * INTO c FROM a1_classify_payment(a3_collected_row(p));
  IF NOT coalesce(c.qualifies, false) THEN
    PERFORM a1_note('stripe_event', p_id, 'event_on_unposted_payment', 'error', 'The payment is not in the ledger (' || coalesce(c.err, c.excluded_reason, 'unknown') || ')');
    RETURN;
  END IF;
  IF coalesce(e.amount_cents, 0) <= 0 THEN
    PERFORM a1_note('stripe_event', p_id, 'event_without_amount', 'error', e.kind);
    RETURN;
  END IF;
  IF e.kind = 'application_fee_refund' AND a3_payment_arrangement(p) = 'platform_only' THEN
    PERFORM a1_note('stripe_event', p_id, 'fee_refund_without_transfer', 'error', 'A Modus fee refund on a charge with no connected account');
    RETURN;
  END IF;
  IF e.kind = 'transfer_reversal' THEN v_dr := '2190'; v_cr := '1050'; v_memo := 'Transfer reversal · owner returned funds';
  ELSE v_dr := '1050'; v_cr := '2190'; v_memo := 'Modus fee pushed back to owner';
  END IF;
  v_date := a2_ny_date(coalesce(e.occurred_at, e.created_at));
  SELECT id INTO v_dr_id FROM gl_accounts WHERE accounting_entity_id = c.books AND code = v_dr;
  SELECT id INTO v_cr_id FROM gl_accounts WHERE accounting_entity_id = c.books AND code = v_cr;
  SELECT coalesce(max(source_version), 0) + 1 INTO v_ver FROM journal_entries WHERE source_type = 'stripe_event' AND source_id = p_id;
  INSERT INTO journal_entries (accounting_entity_id, entry_date, memo, source_type, source_id, source_version, kind, signature)
  VALUES (c.books, v_date, v_memo, 'stripe_event', p_id, v_ver, 'post',
          jsonb_build_object('amount', e.amount_cents, 'date', v_date, 'books', c.books, 'debit', v_dr, 'credit', v_cr, 'kind', e.kind))
  RETURNING id INTO v_entry;
  INSERT INTO journal_lines (journal_entry_id, account_id, debit_cents, credit_cents, property_id, unit_id, tenant_id)
  SELECT v_entry, x.acct, x.dr, x.cr, c.property_id, c.unit_id, p.tenant_id
  FROM (VALUES (v_dr_id, e.amount_cents, 0::bigint), (v_cr_id, 0::bigint, e.amount_cents)) AS x(acct, dr, cr);
  PERFORM a1_resolve_others('stripe_event', p_id, '{}');
END;
$$;

CREATE FUNCTION public.a3_stripe_event_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    -- A reversal is evidence of the arrangement, so a refund that was waiting on it posts correctly.
    IF NEW.refund_id IS NOT NULL THEN PERFORM a2_sync_refund(NEW.refund_id); END IF;
    PERFORM a3_sync_stripe_event(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    PERFORM a1_note('stripe_event', NEW.id, 'posting_failed', 'error', left(SQLERRM, 500));
  END;
  RETURN NULL;
END;
$$;
CREATE TRIGGER a3_post_stripe_events AFTER INSERT ON public.stripe_fee_events
  FOR EACH ROW EXECUTE FUNCTION public.a3_stripe_event_trigger();

-- Reconciliation shows the new exception sources with their own amount and description.
CREATE OR REPLACE FUNCTION public.a1_open_exceptions()
RETURNS TABLE (source_type text, source_id uuid, code text, severity text, detail text, last_seen timestamptz,
               amount_cents bigint, source_date date, description text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT x.source_type, x.source_id, x.code, x.severity, x.detail, x.last_seen,
         CASE x.source_type WHEN 'payment' THEN coalesce(p.amount_cents, round(p.amount * 100)::bigint)
                            WHEN 'refund'  THEN rf.amount_cents
                            WHEN 'stripe_event' THEN se.amount_cents
                            WHEN 'charge' THEN tc.amount_cents
                            ELSE round(e.amount * 100)::bigint END,
         CASE x.source_type WHEN 'payment' THEN (p.paid_at AT TIME ZONE 'America/New_York')::date
                            WHEN 'refund'  THEN (rf.refunded_at AT TIME ZONE 'America/New_York')::date
                            WHEN 'stripe_event' THEN (se.occurred_at AT TIME ZONE 'America/New_York')::date
                            WHEN 'charge' THEN tc.due_date
                            ELSE coalesce(e.paid_at, e.date) END,
         CASE x.source_type WHEN 'payment' THEN concat_ws(' · ', t.name, nullif(p.category, ''), p.status,
                                                   CASE WHEN p.paid_at IS NULL THEN 'recorded ' || (p.created_at AT TIME ZONE 'America/New_York')::date END)
                            WHEN 'refund'  THEN concat_ws(' · ', 'Refund', rt.name, nullif(rp.category, ''), nullif(rf.reason, ''))
                            WHEN 'stripe_event' THEN concat_ws(' · ', replace(se.kind, '_', ' '), se.stripe_object_id)
                            WHEN 'charge' THEN concat_ws(' · ', 'Charge', ct.name, tc.category, tc.memo)
                            ELSE concat_ws(' · ', nullif(e.description, ''), nullif(e.vendor_name, ''), e.category) END
  FROM posting_exceptions x
  LEFT JOIN payments p ON x.source_type = 'payment' AND p.id = x.source_id
  LEFT JOIN tenants t  ON t.id = p.tenant_id
  LEFT JOIN expenses e ON x.source_type = 'expense' AND e.id = x.source_id
  LEFT JOIN payment_refunds rf ON x.source_type = 'refund' AND rf.id = x.source_id
  LEFT JOIN payments rp ON rp.id = rf.payment_id
  LEFT JOIN tenants rt ON rt.id = rp.tenant_id
  LEFT JOIN stripe_fee_events se ON x.source_type = 'stripe_event' AND se.id = x.source_id
  LEFT JOIN tenant_charges tc ON x.source_type = 'charge' AND tc.id = x.source_id
  LEFT JOIN tenants ct ON ct.id = tc.tenant_id
  WHERE x.resolved_at IS NULL AND is_landlord()
  ORDER BY x.severity, x.last_seen DESC;
$$;

-- Each Stripe refund. Outstanding = the owner's 95% − transfer reversals + fee refunds, per payment. Zero is complete.
CREATE FUNCTION public.a3_refund_reconciliation()
RETURNS TABLE (refund_id uuid, payment_id uuid, stripe_refund_id text, tenant_name text, books_name text, property_name text, refunded_on date,
               refund_cents bigint, modus_fee_share_cents bigint, owner_share_cents bigint, arrangement text, transfer_reversed_cents bigint, fee_refunded_cents bigint,
               outstanding_cents bigint, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT f.id, p.id, f.stripe_refund_id, t.name, ae.name, pr.name, a2_ny_date(f.refunded_at),
         f.amount_cents, sh.withheld_cents + sh.accrued_cents, f.amount_cents - sh.withheld_cents, a.arr, e.reversed, e.fee_back,
         CASE WHEN f.reversed_at IS NOT NULL THEN e.fee_back - e.reversed
              WHEN a.arr IN ('destination','unconfirmed') THEN f.amount_cents - sh.withheld_cents - e.reversed + e.fee_back
              ELSE 0 END,
         CASE WHEN f.reversed_at IS NOT NULL THEN 'refund_failed_reversal_kept'
              WHEN a.arr = 'platform_only' THEN 'not_required'
              WHEN a.arr = 'unconfirmed' THEN 'arrangement_unconfirmed'
              WHEN e.details = 0 THEN 'details_missing'
              WHEN e.reversed = 0 THEN 'reversal_missing'
              WHEN f.amount_cents - sh.withheld_cents - e.reversed + e.fee_back > 0 THEN 'reversal_short'
              WHEN f.amount_cents - sh.withheld_cents - e.reversed + e.fee_back < 0 THEN 'modus_fee_not_returned'
              ELSE 'reversal_complete' END
  FROM payment_refunds f
  JOIN payments p ON p.id = f.payment_id
  LEFT JOIN tenants t ON t.id = p.tenant_id
  LEFT JOIN units u ON u.id = p.unit_id
  LEFT JOIN properties pr ON pr.id = u.property_id
  LEFT JOIN accounting_entities ae ON ae.id = pr.accounting_entity_id
  CROSS JOIN LATERAL a3_refund_fee_shares(f.id) sh
  CROSS JOIN LATERAL (SELECT a3_payment_arrangement(p) AS arr) a
  CROSS JOIN LATERAL (SELECT coalesce(sum(x.amount_cents) FILTER (WHERE x.kind = 'transfer_reversal'), 0)::bigint reversed,
                             coalesce(sum(x.amount_cents) FILTER (WHERE x.kind = 'application_fee_refund'), 0)::bigint fee_back,
                             count(*) FILTER (WHERE x.kind IN ('refund_balance_transaction','transfer_reversal')) details
                      FROM stripe_fee_events x WHERE x.payment_id = p.id) e
  WHERE is_landlord() AND f.stripe_refund_id IS NOT NULL AND (f.reversed_at IS NULL OR e.reversed > 0)
  ORDER BY a2_ny_date(f.refunded_at), f.stripe_refund_id;
$$;

-- Each payment returned after it succeeded: what the owner still holds, and how far recovery has got. Modus tracks; a person acts in Stripe.
CREATE FUNCTION public.a3_return_recovery()
RETURNS TABLE (return_id uuid, payment_id uuid, kind text, reason text, tenant_name text, books_name text, property_name text, paid_on date, returned_on date,
               gross_cents bigint, owner_share_cents bigint, modus_fee_cents bigint, transfer_reversed_cents bigint, fee_refunded_cents bigint, direct_repaid_cents bigint,
               outstanding_cents bigint, recovery_status text, stripe_charge_id text, stripe_transfer_id text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, p.id, r.kind, r.reason, t.name, ae.name, pr.name, c.entry_date, r.returned_on,
         r.amount_cents, r.amount_cents - coalesce(c.fee_cents, 0), f.withheld_cents + f.accrued_cents, e.reversed, e.fee_back, d.repaid,
         CASE WHEN a.arr IN ('destination','unconfirmed') THEN r.amount_cents - coalesce(c.fee_cents, 0) - e.reversed + e.fee_back - d.repaid ELSE 0 END,
         CASE WHEN a.arr NOT IN ('destination','unconfirmed') THEN 'not_required'
              WHEN r.amount_cents - coalesce(c.fee_cents, 0) - e.reversed + e.fee_back - d.repaid = 0 THEN 'recovered'
              WHEN r.amount_cents - coalesce(c.fee_cents, 0) - e.reversed + e.fee_back - d.repaid < 0 THEN 'over_recovered'
              WHEN e.reversed > 0 OR d.repaid > 0 THEN 'partly_recovered'
              ELSE 'not_started' END,
         p.stripe_charge_id, p.stripe_transfer_id
  FROM payment_returns r
  JOIN payments p ON p.id = r.payment_id
  LEFT JOIN tenants t ON t.id = p.tenant_id
  CROSS JOIN LATERAL a1_classify_payment(a3_collected_row(p)) c
  CROSS JOIN LATERAL a3_fee_parts(p) f
  CROSS JOIN LATERAL (SELECT a3_payment_arrangement(p) AS arr) a
  LEFT JOIN properties pr ON pr.id = c.property_id
  LEFT JOIN accounting_entities ae ON ae.id = c.books
  CROSS JOIN LATERAL (SELECT coalesce(sum(x.amount_cents) FILTER (WHERE x.kind = 'transfer_reversal'), 0)::bigint reversed,
                             coalesce(sum(x.amount_cents) FILTER (WHERE x.kind = 'application_fee_refund'), 0)::bigint fee_back
                      FROM stripe_fee_events x WHERE x.payment_id = p.id) e
  CROSS JOIN LATERAL (SELECT coalesce(sum(b.amount_cents), 0)::bigint repaid
                      FROM book_transactions b WHERE b.payment_return_id = r.id AND b.voided_at IS NULL) d
  WHERE is_landlord()
  ORDER BY r.returned_on DESC, r.id;
$$;

-- Per set of books: account 2190 against what refunds, returns, reversals, fee refunds and repayments say it should be.
CREATE FUNCTION public.a3_refund_due_check(p_as_of date DEFAULT NULL)
RETURNS TABLE (books uuid, books_name text, ledger_cents bigint, refunds_cents bigint, returns_cents bigint, reversed_cents bigint, fee_refunded_cents bigint,
               settled_cents bigint, expected_cents bigint, in_balance boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH d AS (SELECT coalesce(p_as_of, a2_today()) AS as_of),
  x AS (
    SELECT ae.id, ae.name,
      (SELECT coalesce(sum(l.credit_cents - l.debit_cents), 0)::bigint FROM journal_lines l JOIN journal_entries je ON je.id = l.journal_entry_id JOIN gl_accounts a ON a.id = l.account_id
        WHERE je.accounting_entity_id = ae.id AND a.code = '2190' AND je.entry_date <= d.as_of) led,
      (SELECT coalesce(sum(f.amount_cents - (a3_refund_fee_shares(f.id)).withheld_cents), 0)::bigint FROM payment_refunds f JOIN payments p ON p.id = f.payment_id JOIN units u ON u.id = p.unit_id JOIN properties pr ON pr.id = u.property_id
        WHERE pr.accounting_entity_id = ae.id AND f.reversed_at IS NULL AND a3_payment_arrangement(p) IN ('destination','unconfirmed') AND a2_ny_date(f.refunded_at) <= d.as_of) ref,
      (SELECT coalesce(sum(r.amount_cents - (a3_fee_parts(p)).withheld_cents), 0)::bigint FROM payment_returns r JOIN payments p ON p.id = r.payment_id JOIN units u ON u.id = p.unit_id JOIN properties pr ON pr.id = u.property_id
        WHERE pr.accounting_entity_id = ae.id AND a3_payment_arrangement(p) IN ('destination','unconfirmed') AND r.returned_on <= d.as_of) ret,
      (SELECT coalesce(sum(e.amount_cents) FILTER (WHERE e.kind = 'transfer_reversal'), 0)::bigint FROM stripe_fee_events e JOIN payments p ON p.id = e.payment_id JOIN units u ON u.id = p.unit_id JOIN properties pr ON pr.id = u.property_id
        WHERE pr.accounting_entity_id = ae.id AND a2_ny_date(coalesce(e.occurred_at, e.created_at)) <= d.as_of AND lower(coalesce(p.status, '')) <> 'failed') rev,
      (SELECT coalesce(sum(e.amount_cents) FILTER (WHERE e.kind = 'application_fee_refund'), 0)::bigint FROM stripe_fee_events e JOIN payments p ON p.id = e.payment_id JOIN units u ON u.id = p.unit_id JOIN properties pr ON pr.id = u.property_id
        WHERE pr.accounting_entity_id = ae.id AND a2_ny_date(coalesce(e.occurred_at, e.created_at)) <= d.as_of AND lower(coalesce(p.status, '')) <> 'failed') feeb,
      (SELECT coalesce(sum(b.amount_cents), 0)::bigint FROM book_transactions b
        WHERE b.accounting_entity_id = ae.id AND b.txn_type = 'modus_settlement' AND b.voided_at IS NULL AND b.txn_date <= d.as_of) set_
    FROM accounting_entities ae, d)
  SELECT id, name, led, ref, ret, rev, feeb, set_, ref + ret - rev + feeb - set_, led = ref + ret - rev + feeb - set_
  FROM x WHERE is_landlord() AND (led <> 0 OR ref <> 0 OR ret <> 0 OR rev <> 0 OR feeb <> 0 OR set_ <> 0)
  ORDER BY name;
$$;

-- Per set of books, today: does the recovery worklist add up to account 2190? A settlement not tied to a payment lowers 2190 but no worklist row, so it's shown on its own.
CREATE FUNCTION public.a3_recovery_tie()
RETURNS TABLE (books uuid, books_name text, ledger_cents bigint, returns_outstanding_cents bigint, refunds_outstanding_cents bigint,
               unassigned_repaid_cents bigint, difference_cents bigint, in_balance boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH items AS (
    SELECT 'return' AS k, r.payment_id, r.outstanding_cents c FROM a3_return_recovery() r
    UNION ALL SELECT 'refund', r.payment_id, r.outstanding_cents FROM a3_refund_reconciliation() r
  ), per AS (
    SELECT pr.accounting_entity_id AS id,
           coalesce(sum(i.c) FILTER (WHERE i.k = 'return'), 0)::bigint ret, coalesce(sum(i.c) FILTER (WHERE i.k = 'refund'), 0)::bigint ref
    FROM items i JOIN payments p ON p.id = i.payment_id JOIN units u ON u.id = p.unit_id JOIN properties pr ON pr.id = u.property_id
    GROUP BY 1
  ), un AS (
    SELECT b.accounting_entity_id AS id, sum(b.amount_cents)::bigint s FROM book_transactions b
    WHERE b.txn_type = 'modus_settlement' AND b.payment_return_id IS NULL AND b.voided_at IS NULL AND b.txn_date <= a2_today() GROUP BY 1
  ), led AS (SELECT d.books AS id, d.books_name, d.ledger_cents FROM a3_refund_due_check(a2_today()) d)
  SELECT led.id, led.books_name, led.ledger_cents, coalesce(per.ret, 0), coalesce(per.ref, 0), coalesce(un.s, 0),
         led.ledger_cents - (coalesce(per.ret, 0) + coalesce(per.ref, 0) - coalesce(un.s, 0)),
         led.ledger_cents = coalesce(per.ret, 0) + coalesce(per.ref, 0) - coalesce(un.s, 0)
  FROM led LEFT JOIN per ON per.id = led.id LEFT JOIN un ON un.id = led.id
  WHERE is_landlord()
  ORDER BY led.books_name;
$$;

-- Per set of books: the 5% the owner owes on rent Modus didn't withhold, against the ledger.
CREATE FUNCTION public.a3_fee_payable_check(p_as_of date DEFAULT NULL)
RETURNS TABLE (books uuid, books_name text, accrued_cents bigint, reversed_cents bigint, paid_cents bigint, expected_cents bigint, ledger_cents bigint, in_balance boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH d AS (SELECT coalesce(p_as_of, a2_today()) AS as_of),
  x AS (
    SELECT ae.id, ae.name,
      (SELECT coalesce(sum(l.credit_cents - l.debit_cents), 0)::bigint FROM journal_lines l JOIN journal_entries je ON je.id = l.journal_entry_id JOIN gl_accounts a ON a.id = l.account_id
        WHERE je.accounting_entity_id = ae.id AND a.code = '2195' AND je.entry_date <= d.as_of) led,
      (SELECT coalesce(sum((a3_fee_parts(p)).accrued_cents), 0)::bigint FROM payments p JOIN units u ON u.id = p.unit_id JOIN properties pr ON pr.id = u.property_id
        WHERE pr.accounting_entity_id = ae.id AND lower(coalesce(p.status, '')) = 'paid' AND p.voided_at IS NULL AND a2_ny_date(p.paid_at) <= d.as_of) acc,
      (SELECT coalesce(sum((a3_refund_fee_shares(f.id)).accrued_cents), 0)::bigint FROM payment_refunds f JOIN payments p ON p.id = f.payment_id JOIN units u ON u.id = p.unit_id JOIN properties pr ON pr.id = u.property_id
        WHERE pr.accounting_entity_id = ae.id AND f.reversed_at IS NULL AND lower(coalesce(p.status, '')) = 'paid' AND a2_ny_date(f.refunded_at) <= d.as_of) rev,
      (SELECT coalesce(sum(b.amount_cents), 0)::bigint FROM book_transactions b
        WHERE b.accounting_entity_id = ae.id AND b.txn_type = 'modus_fee_payment' AND b.voided_at IS NULL AND b.txn_date <= d.as_of) paid
    FROM accounting_entities ae, d)
  SELECT id, name, acc, rev, paid, acc - rev - paid, led, led = acc - rev - paid
  FROM x WHERE is_landlord() AND (led <> 0 OR acc <> 0 OR paid <> 0)
  ORDER BY name;
$$;

-- Modus's own economics, kept apart from every owner's books: nothing here is in any owner's journal except the fee itself.
-- Revenue is 5% of rent still collected. Stripe's fees and return or dispute fees are Modus's expenses.
CREATE FUNCTION public.a3_platform_economics()
RETURNS TABLE (payment_id uuid, tenant_name text, books_name text, paid_on date, returned_on date, channel text, state text, gross_cents bigint,
               owner_net_cents bigint, modus_fee_cents bigint, fee_reversed_cents bigint, revenue_cents bigint, fee_collection text,
               stripe_fee_cents bigint, stripe_fee_returned_cents bigint, return_fee_cents bigint, expense_cents bigint, net_to_modus_cents bigint,
               outstanding_recovery_cents bigint, flags text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH base AS (
    SELECT p.*, c.entry_date, c.books cbooks, f.withheld_cents, f.accrued_cents, pr.returned_on ret_on,
           coalesce(p.amount_cents, round(p.amount * 100)::bigint, 0) gross,
           CASE WHEN p.stripe_payment_intent_id IS NOT NULL THEN 'stripe' ELSE 'offline' END chan,
           CASE WHEN pr.id IS NOT NULL THEN 'returned' WHEN lower(coalesce(p.status, '')) = 'failed' THEN 'failed_before_settlement' ELSE 'collected' END st,
           (SELECT coalesce(sum(x.amount_cents), 0)::bigint FROM payment_refunds x WHERE x.payment_id = p.id AND x.reversed_at IS NULL) refunded,
           (SELECT coalesce(sum((a3_refund_fee_shares(x.id)).withheld_cents + (a3_refund_fee_shares(x.id)).accrued_cents), 0)::bigint FROM payment_refunds x WHERE x.payment_id = p.id AND x.reversed_at IS NULL) fee_shares,
           (SELECT coalesce(sum(abs(e.fee_cents)) FILTER (WHERE e.kind = 'refund_balance_transaction'), 0)::bigint FROM stripe_fee_events e WHERE e.payment_id = p.id) stripe_back,
           (SELECT coalesce(sum(abs(e.fee_cents)) FILTER (WHERE e.kind = 'dispute_fee'), 0)::bigint FROM stripe_fee_events e WHERE e.payment_id = p.id) ret_fee,
           (SELECT count(*) FROM stripe_fee_events e WHERE e.payment_id = p.id AND e.kind = 'return_rejected') rejected
    FROM payments p
    LEFT JOIN payment_returns pr ON pr.payment_id = p.id
    CROSS JOIN LATERAL a1_classify_payment(a3_collected_row(p)) c
    CROSS JOIN LATERAL a3_fee_parts(p) f
    WHERE is_landlord() AND p.voided_at IS NULL
      AND (lower(coalesce(p.status, '')) = 'failed' AND p.stripe_payment_intent_id IS NOT NULL
           OR (c.qualifies AND (p.stripe_payment_intent_id IS NOT NULL OR f.accrued_cents > 0)))
  ), v AS (
    SELECT b.*, b.withheld_cents + b.accrued_cents fee,
           CASE WHEN b.st = 'returned' THEN b.withheld_cents + b.accrued_cents ELSE b.fee_shares END fee_rev,
           coalesce(b.stripe_fee_cents, 0) - b.stripe_back + b.ret_fee exp
    FROM base b
  )
  SELECT v.id, t.name, ae.name, v.entry_date, v.ret_on, v.chan, v.st,
         CASE WHEN v.st = 'failed_before_settlement' THEN 0 ELSE v.gross END,
         CASE WHEN v.st <> 'collected' THEN 0 ELSE v.gross - v.refunded - (v.fee - v.fee_rev) END,
         v.fee, v.fee_rev, v.fee - v.fee_rev,
         CASE WHEN v.accrued_cents > 0 THEN 'owed_by_owner' WHEN v.withheld_cents > 0 THEN 'withheld_at_stripe' ELSE 'none' END,
         v.stripe_fee_cents, v.stripe_back, v.ret_fee, v.exp, v.fee - v.fee_rev - v.exp,
         coalesce((SELECT r.outstanding_cents FROM a3_return_recovery() r WHERE r.payment_id = v.id), 0)::bigint
           + coalesce((SELECT sum(r.outstanding_cents) FROM a3_refund_reconciliation() r WHERE r.payment_id = v.id), 0)::bigint,
         array_remove(ARRAY[
           CASE WHEN v.chan = 'stripe' AND v.st <> 'failed_before_settlement' AND v.stripe_fee_cents IS NULL THEN 'stripe_fee_not_captured' END,
           CASE WHEN v.st = 'failed_before_settlement' THEN 'failure_fee_not_captured' END,
           CASE WHEN v.st = 'returned' AND v.chan = 'stripe' AND v.ret_fee = 0 THEN 'return_fee_not_captured' END,
           CASE WHEN v.stripe_application_fee_cents IS NOT NULL AND v.stripe_application_fee_cents <> v.withheld_cents AND v.st <> 'failed_before_settlement' THEN 'fee_differs_at_stripe' END,
           CASE WHEN v.rejected > 0 THEN 'return_rejected' END
         ], NULL)
  FROM v
  LEFT JOIN tenants t ON t.id = v.tenant_id
  LEFT JOIN accounting_entities ae ON ae.id = v.cbooks
  ORDER BY v.entry_date DESC NULLS LAST, v.created_at DESC;
$$;

-- Modus's income statement for a period. Fees are earned on the collection date and reversed on the return or refund date.
CREATE FUNCTION public.a3_modus_income(p_from date, p_to date)
RETURNS TABLE (sort_key int, section text, line text, amount_cents bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH e AS (SELECT * FROM a3_platform_economics() WHERE state <> 'failed_before_settlement'),
  earned AS (SELECT coalesce(sum(modus_fee_cents), 0)::bigint s FROM e WHERE paid_on BETWEEN p_from AND p_to),
  ret AS (SELECT coalesce(sum(modus_fee_cents), 0)::bigint s FROM e WHERE state = 'returned' AND returned_on BETWEEN p_from AND p_to),
  ref AS (SELECT coalesce(sum((a3_refund_fee_shares(f.id)).withheld_cents + (a3_refund_fee_shares(f.id)).accrued_cents), 0)::bigint s
          FROM payment_refunds f WHERE f.reversed_at IS NULL AND a2_ny_date(f.refunded_at) BETWEEN p_from AND p_to),
  fees AS (SELECT coalesce(sum(p.stripe_fee_cents), 0)::bigint s FROM payments p WHERE p.voided_at IS NULL AND lower(coalesce(p.status, '')) IN ('paid','returned') AND a2_ny_date(p.paid_at) BETWEEN p_from AND p_to),
  back AS (SELECT coalesce(sum(abs(x.fee_cents)), 0)::bigint s FROM stripe_fee_events x WHERE x.kind = 'refund_balance_transaction' AND a2_ny_date(coalesce(x.occurred_at, x.created_at)) BETWEEN p_from AND p_to),
  disp AS (SELECT coalesce(sum(abs(x.fee_cents)), 0)::bigint s FROM stripe_fee_events x WHERE x.kind = 'dispute_fee' AND a2_ny_date(coalesce(x.occurred_at, x.created_at)) BETWEEN p_from AND p_to)
  SELECT * FROM (VALUES
    (1, 'Revenue', 'Modus Management Fee Revenue (5% of rent collected)', (SELECT s FROM earned)),
    (2, 'Revenue', 'Less: fees reversed on returned payments', -(SELECT s FROM ret)),
    (3, 'Revenue', 'Less: fees reversed on refunded rent', -(SELECT s FROM ref)),
    (4, 'Revenue', 'Net revenue', (SELECT s FROM earned) - (SELECT s FROM ret) - (SELECT s FROM ref)),
    (5, 'Expenses', 'Stripe processing fees', (SELECT s FROM fees)),
    (6, 'Expenses', 'Less: Stripe fees returned', -(SELECT s FROM back)),
    (7, 'Expenses', 'ACH return and dispute fees', (SELECT s FROM disp)),
    (8, 'Expenses', 'Total expenses', (SELECT s FROM fees) - (SELECT s FROM back) + (SELECT s FROM disp)),
    (9, 'Net', 'Net to Modus', (SELECT s FROM earned) - (SELECT s FROM ret) - (SELECT s FROM ref) - (SELECT s FROM fees) + (SELECT s FROM back) - (SELECT s FROM disp)),
    -- Balances today, not period activity: money Modus has paid out and expects back isn't an expense.
    (10, 'Memo', 'Recoverable from owners: returned or refunded rent they still hold', (SELECT coalesce(sum(greatest(x.c, 0)), 0)::bigint FROM (SELECT r.outstanding_cents c FROM a3_return_recovery() r UNION ALL SELECT r.outstanding_cents FROM a3_refund_reconciliation() r) x)),
    (11, 'Memo', 'Owed to owners: Modus holds more than it should', (SELECT coalesce(sum(greatest(-x.c, 0)), 0)::bigint FROM (SELECT r.outstanding_cents c FROM a3_return_recovery() r UNION ALL SELECT r.outstanding_cents FROM a3_refund_reconciliation() r) x)),
    (12, 'Memo', 'Modus fees owed by owners on rent collected outside Stripe', (SELECT coalesce(sum(y.ledger_cents), 0)::bigint FROM a3_fee_payable_check(a2_today()) y))
  ) AS v(k, sec, l, a)
  WHERE is_landlord();
$$;


-- ============================================================
-- PART 4: Book transactions
-- ============================================================
CREATE FUNCTION public.a3_book_txn_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'A3: book transactions cannot be deleted; void them'; END IF;
  IF OLD.voided_at IS NOT NULL THEN RAISE EXCEPTION 'A3: this transaction is already void'; END IF;
  IF (to_jsonb(NEW) - 'voided_at' - 'voided_by' - 'void_reason') <> (to_jsonb(OLD) - 'voided_at' - 'voided_by' - 'void_reason') THEN
    RAISE EXCEPTION 'A3: book transactions are immutable; void and re-enter';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER a3_book_txn_guard BEFORE UPDATE OR DELETE ON public.book_transactions
  FOR EACH ROW EXECUTE FUNCTION public.a3_book_txn_guard();

-- Dr / Cr by type. Every line of an entry carries the same property, so a property view stays balanced.
CREATE FUNCTION public.a3_sync_book_txn(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b book_transactions; a journal_entries; v_dr text; v_cr text; v_dr_id uuid; v_cr_id uuid; v_entry uuid; v_type text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('book_txn:' || p_id::text, 0));
  a := a1_active_entry('book_txn', p_id);
  SELECT * INTO b FROM book_transactions WHERE id = p_id;
  IF b.voided_at IS NOT NULL THEN
    IF a.id IS NOT NULL THEN PERFORM a1_reverse_entry(a.id, 'Reversal: ' || b.void_reason); END IF;
    RETURN;
  END IF;
  IF a.id IS NOT NULL THEN RETURN; END IF;   -- already posted; rows are immutable
  CASE b.txn_type
    WHEN 'owner_contribution' THEN v_dr := b.cash_account; v_cr := '3100';
    WHEN 'owner_distribution' THEN v_dr := '3200';         v_cr := b.cash_account;
    WHEN 'cash_transfer'      THEN v_dr := b.cash_account; v_cr := b.from_account;
    WHEN 'modus_settlement'   THEN v_dr := '2190';         v_cr := b.cash_account;
    WHEN 'modus_fee_payment'  THEN v_dr := '2195';         v_cr := b.cash_account;
    WHEN 'opening_balance' THEN
      SELECT type INTO v_type FROM gl_accounts WHERE accounting_entity_id = b.accounting_entity_id AND code = b.account_code;
      IF v_type = 'asset' THEN v_dr := b.account_code; v_cr := '3900'; ELSE v_dr := '3900'; v_cr := b.account_code; END IF;
  END CASE;
  SELECT id INTO v_dr_id FROM gl_accounts WHERE accounting_entity_id = b.accounting_entity_id AND code = v_dr;
  SELECT id INTO v_cr_id FROM gl_accounts WHERE accounting_entity_id = b.accounting_entity_id AND code = v_cr;
  IF v_dr_id IS NULL OR v_cr_id IS NULL THEN RAISE EXCEPTION 'A3: chart of accounts incomplete for these books'; END IF;
  INSERT INTO journal_entries (accounting_entity_id, entry_date, memo, source_type, source_id, source_version, kind, signature)
  VALUES (b.accounting_entity_id, b.txn_date, b.memo, 'book_txn', b.id, 1, 'post',
          jsonb_build_object('amount', b.amount_cents, 'date', b.txn_date, 'books', b.accounting_entity_id, 'debit', v_dr, 'credit', v_cr, 'type', b.txn_type))
  RETURNING id INTO v_entry;
  INSERT INTO journal_lines (journal_entry_id, account_id, debit_cents, credit_cents, property_id, tenant_id)
  SELECT v_entry, x.acct, x.dr, x.cr, b.property_id, b.tenant_id
  FROM (VALUES (v_dr_id, b.amount_cents, 0::bigint), (v_cr_id, 0::bigint, b.amount_cents)) AS x(acct, dr, cr);
END;
$$;

CREATE FUNCTION public.a3_book_txn_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM a3_sync_book_txn(NEW.id); RETURN NULL; END;
$$;
CREATE TRIGGER a3_post_book_txns AFTER INSERT OR UPDATE ON public.book_transactions
  FOR EACH ROW EXECUTE FUNCTION public.a3_book_txn_trigger();

CREATE FUNCTION public.a3_record_book_txn(p_books uuid, p_type text, p_date date, p_amount_cents bigint, p_memo text,
    p_property uuid DEFAULT NULL, p_cash_account text DEFAULT '1000', p_from_account text DEFAULT NULL,
    p_account_code text DEFAULT NULL, p_tenant uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_tenant_books uuid;
BEGIN
  PERFORM a2_require_landlord();
  IF NOT EXISTS (SELECT 1 FROM accounting_entities WHERE id = p_books) THEN RAISE EXCEPTION 'A3: select a set of books'; END IF;
  IF p_type NOT IN ('opening_balance','owner_contribution','owner_distribution','cash_transfer','modus_settlement','modus_fee_payment') THEN RAISE EXCEPTION 'A3: unknown transaction type'; END IF;
  IF p_date IS NULL THEN RAISE EXCEPTION 'A3: enter the date of the transaction'; END IF;
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN RAISE EXCEPTION 'A3: amount must be greater than zero'; END IF;
  IF coalesce(btrim(p_memo), '') = '' THEN RAISE EXCEPTION 'A3: a note is required'; END IF;
  IF p_property IS NOT NULL AND NOT EXISTS (SELECT 1 FROM properties WHERE id = p_property AND accounting_entity_id = p_books) THEN
    RAISE EXCEPTION 'A3: that property is not in these books';
  END IF;
  IF p_type = 'opening_balance' AND p_account_code IS NULL THEN RAISE EXCEPTION 'A3: choose the account this opening balance is for'; END IF;
  IF p_type = 'cash_transfer' AND p_from_account IS NULL THEN RAISE EXCEPTION 'A3: choose the account the money left'; END IF;
  IF p_tenant IS NOT NULL THEN
    IF p_type <> 'opening_balance' OR p_account_code <> '2100' THEN RAISE EXCEPTION 'A3: only an opening deposit names a tenant'; END IF;
    SELECT pr.accounting_entity_id INTO v_tenant_books FROM tenants t JOIN units u ON u.id = t.unit_id JOIN properties pr ON pr.id = u.property_id WHERE t.id = p_tenant;
    IF v_tenant_books IS DISTINCT FROM p_books THEN RAISE EXCEPTION 'A3: that tenant is not in these books'; END IF;
  END IF;
  BEGIN
    INSERT INTO book_transactions (accounting_entity_id, property_id, txn_type, txn_date, amount_cents, cash_account, from_account, account_code, tenant_id, memo)
    VALUES (p_books, p_property, p_type, p_date, p_amount_cents,
            CASE WHEN p_type = 'opening_balance' THEN NULL ELSE coalesce(p_cash_account, '1000') END,
            CASE WHEN p_type = 'cash_transfer' THEN p_from_account END,
            CASE WHEN p_type = 'opening_balance' THEN p_account_code END, p_tenant, btrim(p_memo))
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'A3: this account already has an opening balance; void it to replace it';
  END;
  RETURN v_id;
END;
$$;

CREATE FUNCTION public.a3_void_book_txn(p_id uuid, p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM a2_require_landlord();
  IF coalesce(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A3: a reason is required to void a transaction'; END IF;
  UPDATE book_transactions SET voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason) WHERE id = p_id AND voided_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'A3: transaction not found or already void'; END IF;
END;
$$;

-- An owner repaying Modus outside Stripe for one returned payment: Dr 2190 / Cr cash, like any settlement, and tied to that return.
-- It lowers what's outstanding and stays apart from Stripe's transfer reversals. Voiding it (a3_void_book_txn) puts the amount back.
CREATE FUNCTION public.a3_record_owner_repayment(p_return uuid, p_date date, p_amount_cents bigint, p_memo text, p_cash_account text DEFAULT '1000') RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_books uuid; v_prop uuid; v_id uuid;
BEGIN
  PERFORM a2_require_landlord();
  PERFORM pg_advisory_xact_lock(hashtextextended('return_repayment:' || coalesce(p_return::text, ''), 0));
  SELECT * INTO r FROM a3_return_recovery() x WHERE x.return_id = p_return;
  IF NOT FOUND THEN RAISE EXCEPTION 'A3: returned payment not found'; END IF;
  IF r.recovery_status = 'not_required' THEN RAISE EXCEPTION 'A3: the owner never held this money, so there is nothing to repay'; END IF;
  IF p_date IS NULL THEN RAISE EXCEPTION 'A3: enter the date of the repayment'; END IF;
  IF p_date < r.returned_on THEN RAISE EXCEPTION 'A3: a repayment cannot be dated before the payment was returned (%)', r.returned_on; END IF;
  IF p_date > a2_today() THEN RAISE EXCEPTION 'A3: a repayment cannot be dated in the future'; END IF;
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN RAISE EXCEPTION 'A3: amount must be greater than zero'; END IF;
  IF p_amount_cents > r.outstanding_cents THEN RAISE EXCEPTION 'A3: that is more than the % cents still outstanding on this return', greatest(r.outstanding_cents, 0); END IF;
  IF coalesce(btrim(p_memo), '') = '' THEN RAISE EXCEPTION 'A3: a note is required'; END IF;
  IF coalesce(p_cash_account, '1000') NOT IN ('1000','1050') THEN RAISE EXCEPTION 'A3: choose the account the money left'; END IF;
  SELECT c.books, c.property_id INTO v_books, v_prop
    FROM payment_returns pr JOIN payments p ON p.id = pr.payment_id
    CROSS JOIN LATERAL a1_classify_payment(a3_collected_row(p)) c WHERE pr.id = p_return;
  INSERT INTO book_transactions (accounting_entity_id, property_id, txn_type, txn_date, amount_cents, cash_account, memo, payment_return_id)
  VALUES (v_books, v_prop, 'modus_settlement', p_date, p_amount_cents, coalesce(p_cash_account, '1000'), btrim(p_memo), p_return)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;


-- ============================================================
-- PART 5: Reports. Read directly from the journal; every entry balances, so every scope balances.
-- Scope: 'portfolio' | 'owner' | 'books' | 'property', as on the Income Statement.
-- ============================================================
CREATE FUNCTION public.a3_trial_balance(p_as_of date, p_scope text DEFAULT 'portfolio', p_scope_id uuid DEFAULT NULL)
RETURNS TABLE (account_code text, account_name text, account_type text, debit_cents bigint, credit_cents bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT account_code, account_name, account_type,
         greatest(sum(debit_cents) - sum(credit_cents), 0)::bigint,
         greatest(sum(credit_cents) - sum(debit_cents), 0)::bigint
  FROM a1_scoped_lines(DATE '0001-01-01', p_as_of, p_scope, p_scope_id)
  GROUP BY account_code, account_name, account_type
  HAVING sum(debit_cents) <> sum(credit_cents)
  ORDER BY account_code;
$$;

-- Assets = liabilities + equity. There are no closing entries, so income statement accounts appear in equity as
-- retained earnings (years before the as-of year) and net income (the as-of year).
CREATE FUNCTION public.a3_balance_sheet(p_as_of date, p_scope text DEFAULT 'portfolio', p_scope_id uuid DEFAULT NULL)
RETURNS TABLE (section text, sort_key text, account_code text, account_name text, amount_cents bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH l AS (SELECT * FROM a1_scoped_lines(DATE '0001-01-01', p_as_of, p_scope, p_scope_id)),
  bal AS (SELECT l.account_type t, l.account_code c, l.account_name n, sum(l.debit_cents - l.credit_cents)::bigint net FROM l GROUP BY 1, 2, 3),
  ni AS (SELECT coalesce(sum(l.credit_cents - l.debit_cents) FILTER (WHERE l.entry_date <  date_trunc('year', p_as_of)::date), 0)::bigint prior,
                coalesce(sum(l.credit_cents - l.debit_cents) FILTER (WHERE l.entry_date >= date_trunc('year', p_as_of)::date), 0)::bigint cur
         FROM l WHERE l.account_type IN ('income','expense'))
  SELECT 'Assets', bal.c, bal.c, bal.n, bal.net FROM bal WHERE bal.t = 'asset' AND bal.net <> 0
  UNION ALL SELECT 'Liabilities', bal.c, bal.c, bal.n, -bal.net FROM bal WHERE bal.t = 'liability' AND bal.net <> 0
  UNION ALL SELECT 'Equity', bal.c, bal.c, bal.n, -bal.net FROM bal WHERE bal.t = 'equity' AND bal.net <> 0
  UNION ALL SELECT 'Equity', '8', NULL, 'Retained earnings (prior years)', ni.prior FROM ni WHERE ni.prior <> 0
  UNION ALL SELECT 'Equity', '9', NULL, 'Net income (this year)', ni.cur FROM ni WHERE ni.cur <> 0
  ORDER BY 1, 2;
$$;

-- Per set of books: does it balance, and has anyone entered its opening position?
CREATE FUNCTION public.a3_books_status(p_as_of date DEFAULT NULL)
RETURNS TABLE (books uuid, books_name text, owner_name text, owner_type text, debit_cents bigint, credit_cents bigint,
               assets_cents bigint, liabilities_cents bigint, equity_cents bigint, net_income_cents bigint, in_balance boolean,
               opening_entries int, first_entry_on date, cash_cents bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH d AS (SELECT coalesce(p_as_of, a2_today()) AS as_of),
  x AS (
    SELECT je.accounting_entity_id b, a.type t, a.code c, sum(l.debit_cents) dr, sum(l.credit_cents) cr
    FROM journal_entries je JOIN journal_lines l ON l.journal_entry_id = je.id JOIN gl_accounts a ON a.id = l.account_id, d
    WHERE je.entry_date <= d.as_of GROUP BY 1, 2, 3),
  y AS (
    SELECT x.b, sum(x.dr)::bigint dr, sum(x.cr)::bigint cr,
           coalesce(sum(x.dr - x.cr) FILTER (WHERE x.t = 'asset'), 0)::bigint assets,
           coalesce(sum(x.cr - x.dr) FILTER (WHERE x.t = 'liability'), 0)::bigint liab,
           coalesce(sum(x.cr - x.dr) FILTER (WHERE x.t = 'equity'), 0)::bigint eq,
           coalesce(sum(x.cr - x.dr) FILTER (WHERE x.t IN ('income','expense')), 0)::bigint ni,
           coalesce(sum(x.dr - x.cr) FILTER (WHERE x.c IN ('1000','1050')), 0)::bigint cash
    FROM x GROUP BY 1)
  SELECT ae.id, ae.name, oe.name, oe.type, coalesce(y.dr, 0), coalesce(y.cr, 0), coalesce(y.assets, 0), coalesce(y.liab, 0), coalesce(y.eq, 0), coalesce(y.ni, 0),
         coalesce(y.dr, 0) = coalesce(y.cr, 0) AND coalesce(y.assets, 0) = coalesce(y.liab, 0) + coalesce(y.eq, 0) + coalesce(y.ni, 0),
         (SELECT count(*) FROM book_transactions b WHERE b.accounting_entity_id = ae.id AND b.txn_type = 'opening_balance' AND b.voided_at IS NULL)::int,
         (SELECT min(je.entry_date) FROM journal_entries je WHERE je.accounting_entity_id = ae.id), coalesce(y.cash, 0)
  FROM accounting_entities ae
  JOIN ownership_entities oe ON oe.id = ae.owner_entity_id
  LEFT JOIN y ON y.b = ae.id
  WHERE is_landlord()
  ORDER BY oe.name, ae.name;
$$;

-- One account's entries through a date, with a running balance on its normal side.
CREATE FUNCTION public.a3_account_activity(p_as_of date, p_scope text, p_scope_id uuid, p_account_code text)
RETURNS TABLE (entry_id uuid, entry_date date, memo text, kind text, source_type text, books_name text, property_name text, tenant_name text,
               debit_cents bigint, credit_cents bigint, balance_cents bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT s.entry_id, s.entry_date, s.memo, s.kind, s.source_type, ae.name, pr.name, t.name, s.debit_cents, s.credit_cents,
         sum(CASE WHEN s.account_type IN ('asset','expense') THEN s.debit_cents - s.credit_cents ELSE s.credit_cents - s.debit_cents END)
           OVER (ORDER BY s.entry_date, je.created_at, s.entry_id ROWS UNBOUNDED PRECEDING)::bigint
  FROM a1_scoped_lines(DATE '0001-01-01', p_as_of, p_scope, p_scope_id) s
  JOIN journal_entries je ON je.id = s.entry_id
  JOIN accounting_entities ae ON ae.id = s.books
  LEFT JOIN properties pr ON pr.id = s.property_id
  LEFT JOIN tenants t ON t.id = s.tenant_id
  WHERE s.account_code = p_account_code
  ORDER BY s.entry_date, je.created_at, s.entry_id;
$$;

-- Security deposits held, by tenant, straight from account 2100.
CREATE FUNCTION public.a3_deposit_detail(p_as_of date, p_scope text DEFAULT 'portfolio', p_scope_id uuid DEFAULT NULL)
RETURNS TABLE (tenant_id uuid, tenant_name text, property_name text, received_cents bigint, returned_cents bigint, held_cents bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT s.tenant_id, coalesce(t.name, 'No tenant recorded'), max(pr.name),
         sum(s.credit_cents)::bigint, sum(s.debit_cents)::bigint, sum(s.credit_cents - s.debit_cents)::bigint
  FROM a1_scoped_lines(DATE '0001-01-01', p_as_of, p_scope, p_scope_id) s
  LEFT JOIN tenants t ON t.id = s.tenant_id
  LEFT JOIN properties pr ON pr.id = s.property_id
  WHERE s.account_code = '2100'
  GROUP BY s.tenant_id, t.name
  HAVING sum(s.credit_cents - s.debit_cents) <> 0
  ORDER BY 2;
$$;

-- Everyone with something open, worst first, from the receivables ledger (never from legacy balances).
CREATE FUNCTION public.a3_collections(p_as_of date DEFAULT NULL, p_scope text DEFAULT 'portfolio', p_scope_id uuid DEFAULT NULL)
RETURNS TABLE (tenant_id uuid, tenant_name text, email text, phone text, property_name text, unit_number text, books_name text, owner_name text,
               current_cents bigint, d30_cents bigint, d60_cents bigint, d90_cents bigint, open_cents bigint, credit_cents bigint, balance_cents bigint,
               overdue_cents bigint, overdue_charges int, oldest_due date, days_past_due int, late_fee_open_cents bigint,
               last_payment_on date, last_payment_cents bigint, payment_status text, eviction_watch boolean,
               cash_overpayment_cents bigint, rental_credit_cents bigint, opening_credit_cents bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH d AS (SELECT coalesce(p_as_of, a2_today()) AS as_of),
  a AS (SELECT g.* FROM d, a2_aging(d.as_of, p_scope, p_scope_id) g WHERE g.open_cents > 0),
  oc AS (SELECT o.* FROM d, a2_open_charges_internal(d.as_of, NULL) o
         WHERE o.open_cents > 0 AND a2_in_scope(o.property_id, p_scope, p_scope_id)),
  rc AS (SELECT r.* FROM d, a3_receipts(d.as_of, NULL) r)
  SELECT a.tenant_id, a.tenant_name, tn.email::text, to_jsonb(tn) ->> 'phone', a.property_name, u.unit_number::text, a.books_name, oe.name,
         a.current_cents, a.d30_cents, a.d60_cents, a.d90_cents, a.open_cents, a.credit_cents, a.balance_cents,
         coalesce(st.overdue, 0)::bigint, coalesce(st.n, 0)::int, st.oldest, coalesce(d.as_of - st.oldest, 0),
         coalesce(st.fees, 0)::bigint, lp.paid_on, lp.cents,
         CASE WHEN py.settling THEN 'settling'
              WHEN py.returned THEN 'returned'
              WHEN py.failed THEN 'failed'
              WHEN coalesce(st.n, 0) = 0 THEN 'not_yet_due'
              WHEN st.partial THEN 'partial'
              ELSE 'no_payment' END,
         coalesce(tn.eviction_watch, false),
         coalesce(cb.cash_overpayment_cents, 0), coalesce(cb.rental_credit_cents, 0), coalesce(cb.opening_credit_cents, 0)
  FROM a CROSS JOIN d
  JOIN tenants tn ON tn.id = a.tenant_id
  LEFT JOIN units u ON u.id = tn.unit_id
  LEFT JOIN properties pr ON pr.id = u.property_id
  LEFT JOIN accounting_entities ae ON ae.id = pr.accounting_entity_id
  LEFT JOIN ownership_entities oe ON oe.id = ae.owner_entity_id
  LEFT JOIN LATERAL (SELECT sum(oc.open_cents) FILTER (WHERE oc.due_date < d.as_of) overdue, count(*) FILTER (WHERE oc.due_date < d.as_of) n,
                            min(oc.due_date) FILTER (WHERE oc.due_date < d.as_of) oldest,
                            sum(oc.open_cents) FILTER (WHERE oc.cat = 'late fee') fees,
                            bool_or(oc.applied_cents > 0) partial
                     FROM oc WHERE oc.tenant_id = a.tenant_id) st ON true
  LEFT JOIN LATERAL (SELECT r.paid_on, r.net_cents cents FROM rc r WHERE r.tenant_id = a.tenant_id AND r.net_cents > 0 ORDER BY r.paid_on DESC, r.created_at DESC LIMIT 1) lp ON true
  LEFT JOIN LATERAL (SELECT
        EXISTS (SELECT 1 FROM payments x WHERE x.tenant_id = a.tenant_id AND lower(coalesce(x.status, '')) = 'pending' AND x.voided_at IS NULL
                  AND x.stripe_payment_intent_id IS NOT NULL AND a2_ny_date(x.created_at) BETWEEN d.as_of - 14 AND d.as_of) settling,
        coalesce((SELECT lower(coalesce(x.status, '')) = 'failed' FROM payments x
                  WHERE x.tenant_id = a.tenant_id AND x.stripe_payment_intent_id IS NOT NULL AND x.voided_at IS NULL
                    AND a2_ny_date(x.created_at) BETWEEN d.as_of - 30 AND d.as_of
                  ORDER BY x.created_at DESC LIMIT 1), false) failed,
        EXISTS (SELECT 1 FROM payment_returns r JOIN payments x ON x.id = r.payment_id WHERE x.tenant_id = a.tenant_id AND r.returned_on BETWEEN d.as_of - 30 AND d.as_of) returned) py ON true
  LEFT JOIN a3_credit_breakdown(d.as_of, NULL) cb ON cb.tenant_id = a.tenant_id
  WHERE is_landlord()
  ORDER BY coalesce(d.as_of - st.oldest, 0) DESC, a.open_cents DESC, a.tenant_name;
$$;


-- ============================================================
-- PART 6: RLS / grants
-- ============================================================
ALTER TABLE public.payment_applications  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.book_transactions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.a3_replaced_functions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_returns       ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.payment_applications, public.book_transactions, public.a3_replaced_functions, public.payment_returns FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.payment_returns TO authenticated;
GRANT SELECT, INSERT ON public.payment_returns TO service_role;
CREATE POLICY a3_landlord_read_returns ON public.payment_returns FOR SELECT TO authenticated USING (is_landlord());
GRANT SELECT ON public.payment_applications, public.book_transactions TO authenticated;
GRANT ALL ON public.payment_applications, public.book_transactions TO service_role;
CREATE POLICY a3_landlord_read_applications ON public.payment_applications FOR SELECT TO authenticated USING (is_landlord());
CREATE POLICY a3_landlord_read_book_txns    ON public.book_transactions    FOR SELECT TO authenticated USING (is_landlord());

-- Internal engine: never callable by clients.
REVOKE EXECUTE ON FUNCTION public.a3_seed_chart(uuid), public.a3_books_seed_trigger(), public.a3_active_applications(uuid, date), public.a3_receipts(date, uuid), public.a3_sources(uuid),
  public.a3_source_applied(uuid, uuid), public.a3_charge_applied(uuid), public.a3_application_guard(), public.a3_reverse(uuid, bigint, date, text, text, uuid),
  public.a3_reconcile_tenant(uuid, text), public.a3_apply_safely(uuid, text, text, uuid), public.a3_payment_trigger(), public.a3_refund_apply_trigger(),
  public.a3_charge_apply_trigger(), public.a3_payment_arrangement(payments), public.a3_sync_stripe_event(uuid), public.a3_stripe_event_trigger(),
  public.a3_book_txn_guard(), public.a3_sync_book_txn(uuid), public.a3_book_txn_trigger(),
  public.a3_collected_row(payments), public.a3_fee_parts(payments), public.a3_sync_modus_fee(uuid), public.a3_refund_fee_shares(uuid),
  public.a3_return_guard(), public.a3_sync_return(uuid), public.a3_return_trigger(), public.a3_settings_trigger()
  FROM PUBLIC, anon, authenticated, service_role;
-- A2's old pin actions are gone from the API.
REVOKE EXECUTE ON FUNCTION public.a2_pin_application(uuid, uuid, bigint), public.a2_unpin_application(uuid, uuid) FROM PUBLIC, anon, authenticated;
-- The payment function's own read of what Pay Rent may collect.
REVOKE EXECUTE ON FUNCTION public.a3_pay_rent_internal(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.a3_pay_rent_internal(uuid) TO service_role;
-- Client API (each checks the caller itself, or reads through a landlord-only function).
REVOKE EXECUTE ON FUNCTION public.a3_reapply(uuid, uuid, bigint, text), public.a3_reverse_application(uuid, text), public.a3_application_history(uuid, uuid),
  public.a3_application_check(), public.a3_refund_reconciliation(), public.a3_refund_due_check(date), public.a3_platform_economics(),
  public.a3_record_book_txn(uuid, text, date, bigint, text, uuid, text, text, text, uuid), public.a3_void_book_txn(uuid, text),
  public.a3_trial_balance(date, text, uuid), public.a3_balance_sheet(date, text, uuid), public.a3_books_status(date),
  public.a3_issue_rental_credit(uuid, bigint, text, date), public.a3_credit_breakdown(date, uuid), public.a3_rent_credit_this_month(uuid), public.a3_record_payment_return(uuid, date, text),
  public.a3_return_recovery(), public.a3_fee_payable_check(date), public.a3_modus_income(date, date),
  public.a3_account_activity(date, text, uuid, text), public.a3_deposit_detail(date, text, uuid), public.a3_collections(date, text, uuid),
  public.a3_pay_rent_due(uuid), public.a3_recovery_tie(), public.a3_record_owner_repayment(uuid, date, bigint, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.a3_reapply(uuid, uuid, bigint, text), public.a3_reverse_application(uuid, text), public.a3_application_history(uuid, uuid),
  public.a3_application_check(), public.a3_refund_reconciliation(), public.a3_refund_due_check(date), public.a3_platform_economics(),
  public.a3_record_book_txn(uuid, text, date, bigint, text, uuid, text, text, text, uuid), public.a3_void_book_txn(uuid, text),
  public.a3_trial_balance(date, text, uuid), public.a3_balance_sheet(date, text, uuid), public.a3_books_status(date),
  public.a3_issue_rental_credit(uuid, bigint, text, date), public.a3_credit_breakdown(date, uuid), public.a3_rent_credit_this_month(uuid), public.a3_record_payment_return(uuid, date, text),
  public.a3_return_recovery(), public.a3_fee_payable_check(date), public.a3_modus_income(date, date),
  public.a3_account_activity(date, text, uuid, text), public.a3_deposit_detail(date, text, uuid), public.a3_collections(date, text, uuid),
  public.a3_pay_rent_due(uuid), public.a3_recovery_tie(), public.a3_record_owner_repayment(uuid, date, bigint, text, text)
  TO authenticated;


-- ============================================================
-- PART 7: Carry A2's applications forward; postconditions
-- ============================================================
INSERT INTO public.payment_applications (kind, tenant_id, cat, payment_id, credit_charge_id, charge_id, amount_cents, effective_on, origin, event, created_by)
SELECT 'apply', x.tenant_id, x.cat, x.payment_id, x.credit_charge_id, x.charge_id, x.amount_cents,
       greatest(tc.charge_date, coalesce((SELECT r.paid_on FROM public.a2_receipts(DATE '9999-12-31') r WHERE r.payment_id = x.payment_id), cr.charge_date)),
       'migration',
       CASE WHEN EXISTS (SELECT 1 FROM public.payment_application_pins pp WHERE pp.payment_id = x.payment_id AND pp.charge_id = x.charge_id)
            THEN 'Carried over from A2 (landlord re-application)' ELSE 'Carried over from A2' END,
       NULL
FROM a3_pre_applications x
JOIN public.tenant_charges tc ON tc.id = x.charge_id
LEFT JOIN public.tenant_charges cr ON cr.id = x.credit_charge_id
WHERE x.charge_id IS NOT NULL;

-- Triggers start only now, so the carry-forward above isn't re-processed.
CREATE TRIGGER a3_apply_payments AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.a3_payment_trigger();
CREATE TRIGGER a3_apply_refunds AFTER INSERT OR UPDATE ON public.payment_refunds
  FOR EACH ROW EXECUTE FUNCTION public.a3_refund_apply_trigger();
CREATE TRIGGER a3_apply_charges AFTER INSERT OR UPDATE ON public.tenant_charges
  FOR EACH ROW EXECUTE FUNCTION public.a3_charge_apply_trigger();
CREATE TRIGGER a3_settings_changed AFTER UPDATE OF cutover_date ON public.a2_settings
  FOR EACH ROW EXECUTE FUNCTION public.a3_settings_trigger();

-- D10 for anything already recorded. When A2 and A3 ship together there is nothing to restate.
-- Like A1's backfill, a problem with one payment is recorded and doesn't stop the rest.
DO $$
DECLARE v uuid;
BEGIN
  FOR v IN SELECT id FROM public.payments LOOP
    BEGIN PERFORM public.a3_sync_modus_fee(v);
    EXCEPTION WHEN OTHERS THEN PERFORM public.a1_note('payment', v, 'modus_fee_failed', 'error', left(SQLERRM, 500)); END;
  END LOOP;
END $$;
SELECT public.a2_sync_refund(id) FROM public.payment_refunds;
SELECT public.a3_sync_stripe_event(id) FROM public.stripe_fee_events;

DO $$
DECLARE v_bad text;
BEGIN
  -- What each charge shows as open, and each receipt's credit, are exactly what A2 calculated.
  IF EXISTS (SELECT 1 FROM a3_pre_open x FULL JOIN public.a2_open_charges_internal(DATE '9999-12-31', NULL) o ON o.charge_id = x.charge_id
             WHERE x.open_cents IS DISTINCT FROM o.open_cents) THEN
    RAISE EXCEPTION 'A3 post: open charges differ from A2 after carrying applications forward';
  END IF;
  IF EXISTS (SELECT tenant_id, cat, charge_id, payment_id, credit_charge_id, amount_cents FROM a3_pre_applications
             EXCEPT SELECT tenant_id, cat, charge_id, payment_id, credit_charge_id, amount_cents FROM public.a2_applications(DATE '9999-12-31', NULL)) THEN
    RAISE EXCEPTION 'A3 post: stored applications differ from what A2 calculated';
  END IF;
  -- A1 untouched: same classification for every payment, same income and expense in every set of books.
  IF EXISTS (SELECT 1 FROM public.payments p CROSS JOIN LATERAL public.a1_classify_payment(p) c LEFT JOIN a3_pre_classification x ON x.id = p.id
             WHERE x.c IS DISTINCT FROM to_jsonb(c)) THEN
    RAISE EXCEPTION 'A3 post: an existing payment''s classification changed';
  END IF;
  SELECT string_agg(x.code, ', ') INTO v_bad FROM a3_pre_income x
    LEFT JOIN (SELECT je.accounting_entity_id books, a.code, sum(l.credit_cents - l.debit_cents)::bigint net
               FROM public.journal_entries je JOIN public.journal_lines l ON l.journal_entry_id = je.id JOIN public.gl_accounts a ON a.id = l.account_id
               WHERE a.type IN ('income','expense') GROUP BY 1, 2) y ON y.books = x.books AND y.code = x.code
    WHERE x.net IS DISTINCT FROM coalesce(y.net, 0) AND x.code <> '6100';
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'A3 post: income or expense moved on %', v_bad; END IF;
  -- Every set of books has the additions; privileges are as intended.
  IF EXISTS (SELECT 1 FROM public.accounting_entities ae
             WHERE (SELECT count(*) FROM public.gl_accounts a WHERE a.accounting_entity_id = ae.id AND a.code IN ('2190','2195','3100','3200','3900')) <> 5) THEN
    RAISE EXCEPTION 'A3 post: chart additions missing';
  END IF;
  IF has_table_privilege('authenticated', 'public.payment_applications', 'INSERT, UPDATE, DELETE')
     OR has_table_privilege('anon', 'public.payment_applications', 'SELECT')
     OR has_table_privilege('authenticated', 'public.book_transactions', 'INSERT, UPDATE, DELETE')
     OR has_table_privilege('anon', 'public.book_transactions', 'SELECT') THEN
    RAISE EXCEPTION 'A3 post: client write or anon privileges present';
  END IF;
  IF has_function_privilege('authenticated', 'public.a3_reconcile_tenant(uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.a3_active_applications(uuid,date)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.a2_pin_application(uuid,uuid,bigint)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.a3_collections(date,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'A3 post: internal engine is client-callable';
  END IF;
END $$;


-- ============================================================
-- PART 8: Behaviour checks (synthetic, 2099; rolled back to the savepoint)
-- ============================================================
SAVEPOINT a3_verify;

DO $$
DECLARE
  v_books uuid; v_prop uuid := gen_random_uuid(); v_unit uuid := gen_random_uuid(); v_t uuid := gen_random_uuid();
  v_r1 uuid := gen_random_uuid(); v_c1 uuid := gen_random_uuid(); v_c2 uuid := gen_random_uuid(); v_c3 uuid := gen_random_uuid(); v_n bigint; v_a bigint; v_b bigint;
BEGIN
  UPDATE a2_settings SET cutover_date = coalesce(cutover_date, DATE '2099-01-01');
  SELECT id INTO v_books FROM accounting_entities ORDER BY name LIMIT 1;
  INSERT INTO properties (id, name, address, city, state, zip, accounting_entity_id) VALUES (v_prop, 'A3 verify', '1 A St', 'X', 'OH', '00000', v_books);
  INSERT INTO units (id, property_id, unit_number, rent_amount) VALUES (v_unit, v_prop, 'A', 1000);
  INSERT INTO tenants (id, name, email, unit_id) VALUES (v_t, 'A3 Tenant', 'a3@test.invalid', v_unit);
  INSERT INTO tenant_charges (id, tenant_id, unit_id, property_id, category, amount_cents, charge_date, due_date, source) VALUES
    (v_c1, v_t, v_unit, v_prop, 'Rent', 100000, '2099-01-01', '2099-01-01', 'manual'),
    (v_c2, v_t, v_unit, v_prop, 'Rent', 100000, '2099-02-01', '2099-02-01', 'manual'),
    (v_c3, v_t, v_unit, v_prop, 'Parking', 5000, '2099-01-01', '2099-01-01', 'manual');
  -- $1,250 of rent pays January and part of February, never Parking.
  INSERT INTO payments (id, tenant_id, unit_id, category, amount_cents, status, paid_at) VALUES (v_r1, v_t, v_unit, 'Rent', 125000, 'paid', '2099-01-05T17:00:00Z');
  SELECT a3_charge_applied(v_c1), a3_charge_applied(v_c2) INTO v_a, v_b;
  IF (v_a, v_b) IS DISTINCT FROM (100000::bigint, 25000::bigint) THEN RAISE EXCEPTION 'A3 verify: applied % / %', v_a, v_b; END IF;
  IF a3_charge_applied(v_c3) <> 0 THEN RAISE EXCEPTION 'A3 verify: rent paid parking'; END IF;
  -- Reconciling again writes nothing.
  SELECT count(*) INTO v_n FROM payment_applications WHERE tenant_id = v_t;
  PERFORM a3_reconcile_tenant(v_t, 'verify');
  IF (SELECT count(*) FROM payment_applications WHERE tenant_id = v_t) <> v_n THEN RAISE EXCEPTION 'A3 verify: reconcile is not idempotent'; END IF;
  -- A refund takes money from the newest application and leaves a trail.
  INSERT INTO payment_refunds (payment_id, amount_cents, refunded_at, reason) VALUES (v_r1, 30000, '2099-01-20T17:00:00Z', 'verify');
  SELECT a3_charge_applied(v_c1), a3_charge_applied(v_c2) INTO v_a, v_b;
  IF (v_a, v_b) IS DISTINCT FROM (95000::bigint, 0::bigint) THEN RAISE EXCEPTION 'A3 verify: after refund % / %', v_a, v_b; END IF;
  IF NOT EXISTS (SELECT 1 FROM payment_applications WHERE tenant_id = v_t AND kind = 'reversal') THEN RAISE EXCEPTION 'A3 verify: no reversal row'; END IF;
  -- History can't be edited.
  BEGIN
    UPDATE payment_applications SET amount_cents = 1 WHERE tenant_id = v_t;
    RAISE EXCEPTION 'A3 verify: application update allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  -- The journal still balances, with new accounts in use.
  PERFORM a3_seed_chart(v_books);
  INSERT INTO book_transactions (accounting_entity_id, txn_type, txn_date, amount_cents, cash_account, memo) VALUES (v_books, 'owner_contribution', '2099-01-02', 100000, '1000', 'verify');
  IF EXISTS (SELECT 1 FROM journal_entries je WHERE (SELECT coalesce(sum(l.debit_cents - l.credit_cents), 0) FROM journal_lines l WHERE l.journal_entry_id = je.id) <> 0) THEN
    RAISE EXCEPTION 'A3 verify: an entry does not balance';
  END IF;
END $$;

ROLLBACK TO SAVEPOINT a3_verify;
RELEASE SAVEPOINT a3_verify;

SELECT 'A3 financial foundation applied and verified' AS result,
       (SELECT count(*) FROM public.payment_applications) AS applications_carried_forward;

COMMIT;


-- ============================================================
-- ROLLBACK (one transaction). Restores the A1/A2 functions exactly as they were and removes every A3 object.
-- It refuses to run once real A3 activity exists: journal entries from book transactions or Stripe events can't
-- be removed, and removing a manual re-application would rewrite history. Stored applications are simply dropped
-- otherwise, and A2's calculation takes over again.
-- ============================================================
-- BEGIN;
-- DO $$
-- DECLARE r record;
-- BEGIN
--   IF EXISTS (SELECT 1 FROM public.journal_entries WHERE source_type IN ('book_txn','stripe_event','modus_fee','payment_return'))
--      OR EXISTS (SELECT 1 FROM public.journal_lines l JOIN public.gl_accounts a ON a.id = l.account_id WHERE a.code IN ('2190','2195','3100','3200','3900'))
--      OR EXISTS (SELECT 1 FROM public.payment_applications WHERE origin = 'manual')
--      OR EXISTS (SELECT 1 FROM public.payment_returns)
--      OR EXISTS (SELECT 1 FROM public.tenant_charges WHERE source = 'rental_credit') THEN
--     RAISE EXCEPTION 'A3 rollback refused: A3 activity exists; restore from backup instead';
--   END IF;
--   FOR r IN SELECT definition FROM public.a3_replaced_functions LOOP EXECUTE r.definition; END LOOP;
-- END $$;
-- GRANT EXECUTE ON FUNCTION public.a2_pin_application(uuid, uuid, bigint), public.a2_unpin_application(uuid, uuid) TO authenticated;
-- DROP TRIGGER a3_apply_payments ON public.payments;
-- DROP TRIGGER a3_apply_refunds ON public.payment_refunds;
-- DROP TRIGGER a3_apply_charges ON public.tenant_charges;
-- DROP TRIGGER a3_post_stripe_events ON public.stripe_fee_events;
-- DROP TRIGGER a3_settings_changed ON public.a2_settings;
-- DROP TRIGGER a3_seed_chart_on_books ON public.accounting_entities;
-- DROP INDEX public.payments_stripe_payment_intent_unique;
-- DROP TABLE public.payment_applications, public.book_transactions, public.a3_replaced_functions, public.payment_returns;
-- DELETE FROM public.gl_accounts WHERE code IN ('2190','2195','3100','3200','3900');
-- UPDATE public.gl_accounts SET name = 'Payment Processing Fees' WHERE code = '6100';
-- ALTER TABLE public.tenant_charges DROP CONSTRAINT tenant_charges_source_check, DROP CONSTRAINT tenant_charges_negative_check, DROP CONSTRAINT tenant_charges_rental_credit_check, DROP CONSTRAINT tenant_charges_applies_from_check, DROP COLUMN applies_from;
-- ALTER TABLE public.tenant_charges ADD CHECK (source IN ('schedule','late_fee','manual','opening_balance')), ADD CHECK (amount_cents > 0 OR source = 'opening_balance');
-- ALTER TABLE public.stripe_fee_events DROP CONSTRAINT stripe_fee_events_kind_check;
-- ALTER TABLE public.stripe_fee_events ADD CHECK (kind IN ('refund_balance_transaction','transfer_reversal','application_fee_refund','refund_failed','refund_rejected'));
-- DO $$
-- DECLARE r record;
-- BEGIN
--   FOR r IN SELECT p.oid::regprocedure AS f FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'a3\_%' LOOP
--     EXECUTE 'DROP FUNCTION ' || r.f;
--   END LOOP;
-- END $$;
-- ALTER TABLE public.journal_entries DROP CONSTRAINT journal_entries_source_type_check;
-- ALTER TABLE public.journal_entries ADD CONSTRAINT journal_entries_source_type_check CHECK (source_type IN ('payment','expense','refund'));
-- ALTER TABLE public.posting_exceptions DROP CONSTRAINT posting_exceptions_source_type_check;
-- ALTER TABLE public.posting_exceptions ADD CONSTRAINT posting_exceptions_source_type_check CHECK (source_type IN ('payment','expense','refund'));
-- COMMIT;
