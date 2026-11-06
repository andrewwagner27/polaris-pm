-- ============================================================
-- A3.1: Property & Portfolio Financial Snapshot
-- Requires A1 (ledger). Independent of A2 receivables and of the frozen A3 foundation migration.
-- LOCAL ONLY until approved.
--
--   Part 0  Preconditions
--   Part 1  Owner-entered inputs: property_financial_profiles, property_loans, ownership_entities.managed_for_client
--   Part 2  Read API: a31_property_ledger (period actuals by property and account), a31_property_history
--   Part 3  RLS / grants (landlord only, as every other landlord table)
--   Part 4  Postconditions
--
-- RULES
--   * Actual figures come only from the A1 journal (cash basis). Nothing here posts, reverses or changes a journal entry.
--   * Owner-entered figures (value, purchase, cash invested, loans) are stored as entered and are never inferred.
--   * Missing inputs stay NULL. The app shows a metric only when every input it needs exists.
--   * No existing row is changed. The only change to an existing table is one new column with a default.
-- ============================================================

BEGIN;

-- ============================================================
-- PART 0: Preconditions
-- ============================================================
DO $$
BEGIN
  IF to_regclass('public.journal_lines') IS NULL OR to_regprocedure('public.a1_scoped_lines(date, date, text, uuid)') IS NULL THEN
    RAISE EXCEPTION 'A3.1 requires A1 (journal_lines, a1_scoped_lines)';
  END IF;
  IF to_regclass('public.ownership_entities') IS NULL OR to_regclass('public.accounting_entities') IS NULL THEN
    RAISE EXCEPTION 'A3.1 requires ENT-001 (ownership_entities, accounting_entities)';
  END IF;
  IF to_regclass('public.property_financial_profiles') IS NOT NULL OR to_regclass('public.property_loans') IS NOT NULL THEN
    RAISE EXCEPTION 'A3.1 is already applied';
  END IF;
END $$;

-- Before-state of every existing table this migration could touch, compared in Part 4.
CREATE TEMP TABLE a31_before ON COMMIT DROP AS
SELECT (SELECT count(*) FROM public.journal_entries) je,
       (SELECT count(*) FROM public.journal_lines) jl,
       (SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id), '')) FROM public.properties x) props,
       (SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id), '')) FROM public.ownership_entities x) owners;


-- ============================================================
-- PART 1: Owner-entered inputs
-- ============================================================

-- A third-party client of the managing organization, as opposed to the organization's own holdings.
-- Default false: every existing ownership entity stays "owned" until the landlord says otherwise.
ALTER TABLE public.ownership_entities ADD COLUMN managed_for_client boolean NOT NULL DEFAULT false;

-- One row per property, created when the landlord first enters any of these figures.
CREATE TABLE public.property_financial_profiles (
  property_id          uuid PRIMARY KEY REFERENCES public.properties(id) ON DELETE CASCADE,
  purchase_price_cents bigint CHECK (purchase_price_cents > 0),
  purchase_date        date,
  cash_invested_cents  bigint CHECK (cash_invested_cents > 0),      -- down payment, closing costs and capital put in
  current_value_cents  bigint CHECK (current_value_cents > 0),
  value_as_of          date,
  value_source         text CHECK (value_source IN ('owner_estimate', 'appraisal', 'broker_opinion', 'tax_assessment', 'purchase_price')),
  no_debt              boolean NOT NULL DEFAULT false,                -- landlord confirms there is no loan on the property
  notes                text,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid DEFAULT auth.uid(),
  CHECK ((current_value_cents IS NULL) = (value_as_of IS NULL)),
  CHECK (current_value_cents IS NULL OR value_source IS NOT NULL)
);

-- Loans secured by a property. Monthly payment is principal and interest; NULL means "calculate from the terms".
CREATE TABLE public.property_loans (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id           uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  lender                text,
  original_amount_cents bigint NOT NULL CHECK (original_amount_cents > 0),
  annual_rate_pct       numeric(6,3) NOT NULL CHECK (annual_rate_pct >= 0 AND annual_rate_pct < 100),
  interest_only         boolean NOT NULL DEFAULT false,
  amortization_months   int CHECK (amortization_months BETWEEN 1 AND 600),
  first_payment_date    date NOT NULL,
  monthly_payment_cents bigint CHECK (monthly_payment_cents > 0),
  current_balance_cents bigint CHECK (current_balance_cents >= 0),
  balance_as_of         date,
  paid_off_on           date,
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            uuid DEFAULT auth.uid(),
  CHECK (interest_only OR amortization_months IS NOT NULL),
  CHECK ((current_balance_cents IS NULL) = (balance_as_of IS NULL)),
  CHECK (paid_off_on IS NULL OR paid_off_on >= first_payment_date - 31)
);
CREATE INDEX property_loans_property ON public.property_loans (property_id);

CREATE FUNCTION public.a31_touch() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;
CREATE TRIGGER a31_touch_profiles BEFORE UPDATE ON public.property_financial_profiles FOR EACH ROW EXECUTE FUNCTION public.a31_touch();
CREATE TRIGGER a31_touch_loans    BEFORE UPDATE ON public.property_loans              FOR EACH ROW EXECUTE FUNCTION public.a31_touch();


-- ============================================================
-- PART 2: Read API (SECURITY INVOKER + RLS; landlord only)
-- ============================================================

-- Period actuals by property and account, straight from the journal (posted entries and their reversals).
-- Income is credit minus debit; expense is debit minus credit, as in a1_income_statement.
CREATE FUNCTION public.a31_property_ledger(p_from date, p_to date)
RETURNS TABLE (property_id uuid, account_code text, account_name text, account_type text, amount_cents bigint, entries int)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT s.property_id, s.account_code, s.account_name, s.account_type,
         sum(CASE WHEN s.account_type = 'income' THEN s.credit_cents - s.debit_cents ELSE s.debit_cents - s.credit_cents END)::bigint,
         count(DISTINCT s.entry_id)::int
  FROM a1_scoped_lines(p_from, p_to, 'portfolio', NULL) s
  WHERE s.account_type IN ('income', 'expense') AND s.property_id IS NOT NULL
  GROUP BY s.property_id, s.account_code, s.account_name, s.account_type
  ORDER BY s.property_id, s.account_code;
$$;

-- How far back each property's ledger goes, so the app can tell a full year of history from a partial one.
CREATE FUNCTION public.a31_property_history()
RETURNS TABLE (property_id uuid, first_entry_date date, last_entry_date date)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT l.property_id, min(je.entry_date), max(je.entry_date)
  FROM journal_entries je JOIN journal_lines l ON l.journal_entry_id = je.id
  WHERE is_landlord() AND je.kind = 'post' AND l.property_id IS NOT NULL
  GROUP BY l.property_id;
$$;


-- ============================================================
-- PART 3: RLS / grants
-- ============================================================
ALTER TABLE public.property_financial_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_loans              ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.property_financial_profiles, public.property_loans FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_financial_profiles, public.property_loans TO authenticated;
GRANT ALL ON public.property_financial_profiles, public.property_loans TO service_role;

CREATE POLICY a31_landlord_profiles ON public.property_financial_profiles FOR ALL TO authenticated
  USING (is_landlord()) WITH CHECK (is_landlord());
CREATE POLICY a31_landlord_loans    ON public.property_loans              FOR ALL TO authenticated
  USING (is_landlord()) WITH CHECK (is_landlord());

REVOKE ALL ON FUNCTION public.a31_property_ledger(date, date), public.a31_property_history(), public.a31_touch() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.a31_property_ledger(date, date), public.a31_property_history() TO authenticated, service_role;


-- ============================================================
-- PART 4: Postconditions
-- ============================================================
DO $$
DECLARE b record;
BEGIN
  SELECT * INTO b FROM a31_before;
  IF (SELECT count(*) FROM public.journal_entries) <> b.je OR (SELECT count(*) FROM public.journal_lines) <> b.jl THEN
    RAISE EXCEPTION 'A3.1 post: the journal changed';
  END IF;
  IF (SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id), '')) FROM public.properties x) <> b.props THEN
    RAISE EXCEPTION 'A3.1 post: properties changed';
  END IF;
  IF (SELECT md5(coalesce(string_agg((to_jsonb(x) - 'managed_for_client')::text, '|' ORDER BY x.id), '')) FROM public.ownership_entities x) <> b.owners
     OR EXISTS (SELECT 1 FROM public.ownership_entities WHERE managed_for_client) THEN
    RAISE EXCEPTION 'A3.1 post: ownership entities changed';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE oid IN ('public.property_financial_profiles'::regclass, 'public.property_loans'::regclass) AND NOT relrowsecurity) THEN
    RAISE EXCEPTION 'A3.1 post: RLS is not enabled';
  END IF;
  IF has_table_privilege('anon', 'public.property_financial_profiles', 'SELECT') OR has_table_privilege('anon', 'public.property_loans', 'SELECT')
     OR has_function_privilege('anon', 'public.a31_property_ledger(date, date)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.a31_property_history()', 'EXECUTE') THEN
    RAISE EXCEPTION 'A3.1 post: anon has access';
  END IF;
END $$;

COMMIT;

-- ============================================================
-- ROLLBACK (run as one transaction; removes only what A3.1 added; owner-entered inputs are lost)
-- ============================================================
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.a31_property_ledger(date, date), public.a31_property_history();
-- DROP TABLE IF EXISTS public.property_loans, public.property_financial_profiles;
-- DROP FUNCTION IF EXISTS public.a31_touch();
-- ALTER TABLE public.ownership_entities DROP COLUMN IF EXISTS managed_for_client;
-- COMMIT;
