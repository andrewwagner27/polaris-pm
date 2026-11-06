-- ============================================================
-- A3.2: Actual vs. Budget (pro forma)
-- Requires A1 (ledger) and ENT-001. Independent of A2 receivables and of the frozen A3 foundation migration.
-- LOCAL ONLY until approved.
--
--   Part 0  Preconditions
--   Part 1  Schema: property_budgets (one per property and calendar year), property_budget_lines (monthly, by account code)
--   Part 2  Write guards: the property must belong to the budget's books; every code must be an income or
--           expense account in those books; a property with budgets can't change books
--   Part 3  API: a32_save_budget (replace one budget atomically), a32_monthly_actuals (ledger actuals by month)
--   Part 4  RLS / grants (landlord only, as every other landlord table)
--   Part 5  Postconditions
--
-- RULES
--   * Actuals come only from the A1 journal (posted entries and their reversals, cash basis). Nothing here posts,
--     reverses or changes a journal entry, a payment, a charge or any A2 setting.
--   * A budget line with amount 0 is an intentional zero budget. A missing line means "not budgeted".
--   * Budget lines use the stable account code (e.g. '5000'), never a gl_accounts id, which differs per set of books.
--   * Every function is SECURITY INVOKER: callers act under their own RLS.
-- ============================================================

BEGIN;

-- ============================================================
-- PART 0: Preconditions
-- ============================================================
DO $$
BEGIN
  IF to_regprocedure('public.a1_scoped_lines(date, date, text, uuid)') IS NULL OR to_regclass('public.gl_accounts') IS NULL THEN
    RAISE EXCEPTION 'A3.2 requires A1 (gl_accounts, a1_scoped_lines)';
  END IF;
  IF to_regclass('public.accounting_entities') IS NULL THEN
    RAISE EXCEPTION 'A3.2 requires ENT-001 (accounting_entities)';
  END IF;
  IF to_regclass('public.property_budgets') IS NOT NULL OR to_regclass('public.property_budget_lines') IS NOT NULL THEN
    RAISE EXCEPTION 'A3.2 is already applied';
  END IF;
END $$;

CREATE TEMP TABLE a32_before ON COMMIT DROP AS
SELECT (SELECT count(*) FROM public.journal_entries) je,
       (SELECT count(*) FROM public.journal_lines) jl,
       (SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id), '')) FROM public.properties x) props,
       (SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id), '')) FROM public.gl_accounts x) gl;


-- ============================================================
-- PART 1: Schema
-- ============================================================
CREATE TABLE public.property_budgets (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id          uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  accounting_entity_id uuid NOT NULL REFERENCES public.accounting_entities(id) ON DELETE RESTRICT,
  year                 int  NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid DEFAULT auth.uid(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid DEFAULT auth.uid(),
  UNIQUE (property_id, year)
);

CREATE TABLE public.property_budget_lines (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id    uuid NOT NULL REFERENCES public.property_budgets(id) ON DELETE CASCADE,
  account_code text NOT NULL CHECK (account_code ~ '^[0-9]{4}$'),
  month        smallint NOT NULL CHECK (month BETWEEN 1 AND 12),
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  UNIQUE (budget_id, account_code, month)
);
CREATE INDEX property_budget_lines_budget ON public.property_budget_lines (budget_id);


-- ============================================================
-- PART 2: Write guards (SECURITY INVOKER: they read under the caller's own RLS)
-- ============================================================
-- A budget belongs to the property's current set of books, verified on every write.
CREATE FUNCTION public.a32_budget_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_books uuid; v_found boolean;
BEGIN
  SELECT true, p.accounting_entity_id INTO v_found, v_books FROM properties p WHERE p.id = NEW.property_id;
  IF NOT coalesce(v_found, false) THEN RAISE EXCEPTION 'A3.2: property not found' USING ERRCODE = '23503'; END IF;
  IF v_books IS NULL THEN RAISE EXCEPTION 'A3.2: the property is not assigned to a set of books, so it cannot have a budget' USING ERRCODE = '23514'; END IF;
  IF NEW.accounting_entity_id IS DISTINCT FROM v_books THEN
    RAISE EXCEPTION 'A3.2: the budget''s books must be the property''s books' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' THEN NEW.updated_at := now(); NEW.updated_by := auth.uid(); END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER a32_budget_guard BEFORE INSERT OR UPDATE ON public.property_budgets
  FOR EACH ROW EXECUTE FUNCTION public.a32_budget_guard();

-- Every line's code must be an income or expense account in the budget's books.
CREATE FUNCTION public.a32_line_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM property_budgets b JOIN gl_accounts a ON a.accounting_entity_id = b.accounting_entity_id
                 WHERE b.id = NEW.budget_id AND a.code = NEW.account_code AND a.type IN ('income', 'expense')) THEN
    RAISE EXCEPTION 'A3.2: % is not an income or expense account in this property''s books', NEW.account_code USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER a32_line_guard BEFORE INSERT OR UPDATE ON public.property_budget_lines
  FOR EACH ROW EXECUTE FUNCTION public.a32_line_guard();

-- A property with budgets can't change books. Budgets are tied to the books they were set under, so a silent change
-- would leave them describing the wrong owner's plan. Nothing is deleted, detached or moved: the change is refused
-- until the budgets are removed or deliberately moved. Applies to every writer (app, RPC, SQL editor): it is a row
-- trigger on properties. It fires only when accounting_entity_id actually changes, so other property edits are untouched.
-- SECURITY INVOKER: every role that can update properties (landlords, service_role, the owner) can also see all budgets.
CREATE FUNCTION public.a32_property_books_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_years text;
BEGIN
  SELECT string_agg(year::text, ', ' ORDER BY year) INTO v_years FROM property_budgets WHERE property_id = OLD.id;
  IF v_years IS NOT NULL THEN
    RAISE EXCEPTION 'A3.2: % has budgets for % under its current books, so its books can''t be changed.', OLD.name, v_years
      USING ERRCODE = '23001',
            HINT = 'Remove those budgets, or move them to the new books deliberately, then change the property''s books.';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER a32_property_books_guard BEFORE UPDATE OF accounting_entity_id ON public.properties
  FOR EACH ROW WHEN (OLD.accounting_entity_id IS DISTINCT FROM NEW.accounting_entity_id)
  EXECUTE FUNCTION public.a32_property_books_guard();


-- ============================================================
-- PART 3: API (SECURITY INVOKER + RLS; landlord only)
-- ============================================================
-- Save one property's budget for one year: creates or updates the header and replaces every line, in one transaction.
-- p_lines: [{"account_code":"4000","month":1,"amount_cents":120000}, ...]. A duplicate code+month fails the whole save.
CREATE FUNCTION public.a32_save_budget(p_property uuid, p_year int, p_lines jsonb, p_notes text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_books uuid; v_id uuid;
BEGIN
  IF NOT is_landlord() THEN RAISE EXCEPTION 'A3.2: landlord only' USING ERRCODE = '42501'; END IF;
  IF jsonb_typeof(coalesce(p_lines, '[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'A3.2: lines must be an array' USING ERRCODE = '22023'; END IF;
  SELECT accounting_entity_id INTO v_books FROM properties WHERE id = p_property;
  INSERT INTO property_budgets (property_id, accounting_entity_id, year, notes)
  VALUES (p_property, v_books, p_year, nullif(btrim(p_notes), ''))
  ON CONFLICT (property_id, year) DO UPDATE SET accounting_entity_id = EXCLUDED.accounting_entity_id, notes = EXCLUDED.notes
  RETURNING id INTO v_id;
  DELETE FROM property_budget_lines WHERE budget_id = v_id;
  INSERT INTO property_budget_lines (budget_id, account_code, month, amount_cents)
  SELECT v_id, x.account_code, x.month, x.amount_cents
  FROM jsonb_to_recordset(coalesce(p_lines, '[]'::jsonb)) AS x(account_code text, month smallint, amount_cents bigint);
  RETURN v_id;
END;
$$;

-- Ledger actuals by property, account and calendar month, from the same journal as every other report.
-- Income is credit minus debit; expense is debit minus credit. Reversals post as their own entries, so they net out.
CREATE FUNCTION public.a32_monthly_actuals(p_from date, p_to date)
RETURNS TABLE (property_id uuid, account_code text, account_type text, month date, amount_cents bigint, entries int)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT s.property_id, s.account_code, s.account_type, date_trunc('month', s.entry_date)::date,
         sum(CASE WHEN s.account_type = 'income' THEN s.credit_cents - s.debit_cents ELSE s.debit_cents - s.credit_cents END)::bigint,
         count(DISTINCT s.entry_id)::int
  FROM a1_scoped_lines(p_from, p_to, 'portfolio', NULL) s
  WHERE s.account_type IN ('income', 'expense') AND s.property_id IS NOT NULL
  GROUP BY 1, 2, 3, 4
  ORDER BY 1, 4, 2;
$$;


-- ============================================================
-- PART 4: RLS / grants
-- ============================================================
ALTER TABLE public.property_budgets      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_budget_lines ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.property_budgets, public.property_budget_lines FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_budgets, public.property_budget_lines TO authenticated;
GRANT ALL ON public.property_budgets, public.property_budget_lines TO service_role;

CREATE POLICY a32_landlord_budgets ON public.property_budgets FOR ALL TO authenticated
  USING (is_landlord()) WITH CHECK (is_landlord());
CREATE POLICY a32_landlord_budget_lines ON public.property_budget_lines FOR ALL TO authenticated
  USING (is_landlord()) WITH CHECK (is_landlord());

REVOKE ALL ON FUNCTION public.a32_save_budget(uuid, int, jsonb, text), public.a32_monthly_actuals(date, date),
                       public.a32_budget_guard(), public.a32_line_guard(), public.a32_property_books_guard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.a32_save_budget(uuid, int, jsonb, text), public.a32_monthly_actuals(date, date) TO authenticated, service_role;


-- ============================================================
-- PART 5: Postconditions
-- ============================================================
DO $$
DECLARE b record;
BEGIN
  SELECT * INTO b FROM a32_before;
  IF (SELECT count(*) FROM public.journal_entries) <> b.je OR (SELECT count(*) FROM public.journal_lines) <> b.jl THEN
    RAISE EXCEPTION 'A3.2 post: the journal changed';
  END IF;
  IF (SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id), '')) FROM public.properties x) <> b.props THEN
    RAISE EXCEPTION 'A3.2 post: properties changed';
  END IF;
  IF (SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id), '')) FROM public.gl_accounts x) <> b.gl THEN
    RAISE EXCEPTION 'A3.2 post: chart of accounts changed';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE oid IN ('public.property_budgets'::regclass, 'public.property_budget_lines'::regclass) AND NOT relrowsecurity) THEN
    RAISE EXCEPTION 'A3.2 post: RLS is not enabled';
  END IF;
  IF has_table_privilege('anon', 'public.property_budgets', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
     OR has_table_privilege('anon', 'public.property_budget_lines', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
     OR has_function_privilege('anon', 'public.a32_save_budget(uuid, int, jsonb, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.a32_monthly_actuals(date, date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'A3.2 post: anon has access';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname IN ('a32_save_budget', 'a32_monthly_actuals', 'a32_budget_guard', 'a32_line_guard', 'a32_property_books_guard') AND prosecdef) THEN
    RAISE EXCEPTION 'A3.2 post: a function is SECURITY DEFINER';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled = 'O'
        AND tgname IN ('a32_budget_guard', 'a32_line_guard', 'a32_property_books_guard')) <> 3 THEN
    RAISE EXCEPTION 'A3.2 post: a guard trigger is missing or disabled';
  END IF;
END $$;

COMMIT;

-- ============================================================
-- ROLLBACK (run as one transaction; removes only what A3.2 added; entered budgets are lost)
-- ============================================================
-- BEGIN;
-- DROP TRIGGER IF EXISTS a32_property_books_guard ON public.properties;
-- DROP FUNCTION IF EXISTS public.a32_property_books_guard();
-- DROP FUNCTION IF EXISTS public.a32_save_budget(uuid, int, jsonb, text), public.a32_monthly_actuals(date, date);
-- DROP TABLE IF EXISTS public.property_budget_lines, public.property_budgets;
-- DROP FUNCTION IF EXISTS public.a32_line_guard(), public.a32_budget_guard();
-- COMMIT;
