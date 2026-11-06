-- ============================================================
-- MODUS — A1: Ledger foundation (cash-basis Income Statement, Record Expense)
-- See docs/a1-ledger-readiness.md. NOT APPLIED. Do not run via `supabase db push`;
-- production execution requires owner approval AND a verified logical backup.
--
-- Additive: new tables, functions, triggers; two nullable columns on expenses.
-- Existing rows in payments / expenses are never modified.
--
-- ONE TRANSACTION:
--   Part 0  Preconditions
--   Part 1  Schema: gl_accounts, journal_entries, journal_lines, posting_exceptions,
--           expenses.paid_at / expenses.voided_at
--   Part 2  Integrity: balance per statement, append-only journals, same-books accounts
--   Part 3  Chart of accounts seed + posting engine + non-blocking source triggers
--   Part 4  Read API for the Income Statement, drill-down and reconciliation
--   Part 5  Privileges / RLS
--   Part 6  Backfill history (idempotent) + postconditions
--   Part 7  Behaviour checks with synthetic fixtures, inside a SAVEPOINT that is
--           rolled back before COMMIT
--
-- ACCOUNTING RULES (cash basis):
--   Receipt  = payments row with lower(status) = 'paid' AND no due_date AND no
--              balance_due (rows with due_date / balance_due are CHARGES, e.g. the
--              'Late Fee' rows from late-fee-cron — never income while unpaid).
--   Amount   = amount_cents if set, else round(amount * 100); both set and different
--              → exception (not posted).
--   Income   = by category: rent → 4000 (no category → exception, never assumed);
--              late fee → 4100; pet fee, parking, storage, utilities, laundry, other → 4200;
--              *deposit* → 2100 Security Deposits Held (liability, never income);
--              owner contribution/distribution or unknown category → exception.
--   Expense  = expenses row with paid_at set and voided_at null; category → 5xxx;
--              non-operating categories (mortgage, distribution, deposit, capital…) →
--              exception.
--   Books    = properties.accounting_entity_id of the source's property
--              (payment: payments.unit_id only; no unit → exception, never inferred).
--   Date     = receipt: payments.paid_at (America/New_York); no paid_at → exception,
--              never the recorded date. Expense: expenses.paid_at.
--   Changes  = a source that stops qualifying, changes amount/date/account, or is
--              deleted gets a dated REVERSAL; if it still qualifies a new version posts.
-- ============================================================

BEGIN;

-- ============================================================
-- PART 0: Preconditions
-- ============================================================
DO $$
DECLARE v_bad text; v_n int;
BEGIN
  IF to_regclass('public.journal_entries') IS NOT NULL OR to_regclass('public.gl_accounts') IS NOT NULL THEN
    RAISE EXCEPTION 'A1 precondition: already applied (journal_entries / gl_accounts exist) — nothing to do';
  END IF;

  SELECT string_agg(x, ', ') INTO v_bad FROM unnest(ARRAY[
    'payments.id','payments.tenant_id','payments.unit_id','payments.amount','payments.amount_cents','payments.status',
    'payments.paid_at','payments.created_at','payments.category','payments.balance_due','payments.due_date',
    'payments.stripe_payment_intent_id','payments.platform_fee_cents',
    'expenses.id','expenses.property_id','expenses.unit_id','expenses.category','expenses.description',
    'expenses.amount','expenses.vendor_name','expenses.date',
    'tenants.id','tenants.unit_id','tenants.name','units.id','units.property_id','properties.id','properties.name',
    'properties.accounting_entity_id','accounting_entities.id','accounting_entities.owner_entity_id','accounting_entities.name',
    'ownership_entities.id','ownership_entities.name']) x
  WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = split_part(x, '.', 1) AND column_name = split_part(x, '.', 2));
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'A1 precondition: missing columns %', v_bad; END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'expenses'
             AND column_name IN ('paid_at', 'voided_at')) THEN
    RAISE EXCEPTION 'A1 precondition: expenses.paid_at / voided_at already exist';
  END IF;

  IF to_regprocedure('public.is_landlord()') IS NULL THEN
    RAISE EXCEPTION 'A1 precondition: is_landlord() (ENT-001) missing';
  END IF;
  SELECT count(*) INTO v_n FROM accounting_entities;
  IF v_n = 0 THEN RAISE EXCEPTION 'A1 precondition: no accounting entities (ENT-001 books) exist'; END IF;

  RAISE NOTICE 'A1 preconditions passed.';
END $$;


-- ============================================================
-- PART 1: Schema
-- ============================================================
CREATE TABLE public.gl_accounts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accounting_entity_id uuid NOT NULL REFERENCES public.accounting_entities(id) ON DELETE RESTRICT,
  code                 text NOT NULL,
  name                 text NOT NULL,
  type                 text NOT NULL CHECK (type IN ('asset','liability','equity','income','expense')),
  is_system            boolean NOT NULL DEFAULT true,
  external_ref         text,                 -- future QuickBooks account id (unused in A1)
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (accounting_entity_id, code),
  UNIQUE (id, accounting_entity_id)
);

CREATE TABLE public.journal_entries (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accounting_entity_id uuid NOT NULL REFERENCES public.accounting_entities(id) ON DELETE RESTRICT,
  entry_date           date NOT NULL,
  memo                 text,
  source_type          text NOT NULL CHECK (source_type IN ('payment','expense')),
  source_id            uuid NOT NULL,
  source_version       int  NOT NULL CHECK (source_version >= 1),
  kind                 text NOT NULL CHECK (kind IN ('post','reversal')),
  reverses_entry_id    uuid UNIQUE REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  signature            jsonb,                -- posting inputs; a change triggers reverse + repost
  external_ref         text,                 -- future QuickBooks sync id (unused in A1)
  created_txid         bigint NOT NULL DEFAULT txid_current(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_type, source_id, source_version, kind),
  CHECK ((kind = 'reversal') = (reverses_entry_id IS NOT NULL))
);
CREATE INDEX journal_entries_books_date ON public.journal_entries (accounting_entity_id, entry_date);

CREATE TABLE public.journal_lines (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id uuid NOT NULL REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  account_id       uuid NOT NULL REFERENCES public.gl_accounts(id) ON DELETE RESTRICT,
  debit_cents      bigint NOT NULL DEFAULT 0 CHECK (debit_cents >= 0),
  credit_cents     bigint NOT NULL DEFAULT 0 CHECK (credit_cents >= 0),
  property_id      uuid REFERENCES public.properties(id) ON DELETE RESTRICT,
  unit_id          uuid,
  tenant_id        uuid,
  memo             text,
  CHECK ((debit_cents > 0) <> (credit_cents > 0))
);
CREATE INDEX journal_lines_entry ON public.journal_lines (journal_entry_id);
CREATE INDEX journal_lines_account ON public.journal_lines (account_id);

-- Persisted posting problems (survive with the source write; shown on the reconciliation panel)
CREATE TABLE public.posting_exceptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL CHECK (source_type IN ('payment','expense')),
  source_id   uuid NOT NULL,
  code        text NOT NULL,
  severity    text NOT NULL CHECK (severity IN ('error','warning')),
  detail      text,
  first_seen  timestamptz NOT NULL DEFAULT now(),
  last_seen   timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE (source_type, source_id, code)
);

-- Cash status for expenses (smallest addition that makes cash-basis expenses possible)
ALTER TABLE public.expenses ADD COLUMN paid_at date;
ALTER TABLE public.expenses ADD COLUMN voided_at timestamptz;


-- ============================================================
-- PART 2: Integrity
-- ============================================================
-- Every entry touched by an INSERT statement must balance and have >= 2 lines, and
-- lines may only be added in the transaction that created the entry (immutability).
CREATE FUNCTION public.a1_check_lines() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_bad text;
BEGIN
  SELECT string_agg(je.id::text, ', ') INTO v_bad
  FROM journal_entries je
  WHERE je.id IN (SELECT DISTINCT journal_entry_id FROM new_lines)
    AND (je.created_txid <> txid_current()
         OR (SELECT coalesce(sum(debit_cents), 0) - coalesce(sum(credit_cents), 0) FROM journal_lines l WHERE l.journal_entry_id = je.id) <> 0
         OR (SELECT count(*) FROM journal_lines l WHERE l.journal_entry_id = je.id) < 2);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'A1 ledger: unbalanced, single-line or closed journal entry: %', v_bad USING ERRCODE = '23514';
  END IF;
  -- account must belong to the entry's books
  IF EXISTS (SELECT 1 FROM new_lines nl JOIN journal_entries je ON je.id = nl.journal_entry_id
             JOIN gl_accounts a ON a.id = nl.account_id WHERE a.accounting_entity_id <> je.accounting_entity_id) THEN
    RAISE EXCEPTION 'A1 ledger: line account belongs to different books' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER a1_lines_balanced AFTER INSERT ON public.journal_lines
  REFERENCING NEW TABLE AS new_lines FOR EACH STATEMENT EXECUTE FUNCTION public.a1_check_lines();

CREATE FUNCTION public.a1_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'A1 ledger: % is append-only; correct with a reversal', TG_TABLE_NAME USING ERRCODE = '42501';
END;
$$;
CREATE TRIGGER a1_entries_append_only BEFORE UPDATE OR DELETE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.a1_append_only();
CREATE TRIGGER a1_lines_append_only BEFORE UPDATE OR DELETE ON public.journal_lines
  FOR EACH ROW EXECUTE FUNCTION public.a1_append_only();
CREATE TRIGGER a1_entries_no_truncate BEFORE TRUNCATE ON public.journal_entries
  FOR EACH STATEMENT EXECUTE FUNCTION public.a1_append_only();
CREATE TRIGGER a1_lines_no_truncate BEFORE TRUNCATE ON public.journal_lines
  FOR EACH STATEMENT EXECUTE FUNCTION public.a1_append_only();


-- ============================================================
-- PART 3: Chart of accounts + posting engine
-- ============================================================
CREATE FUNCTION public.a1_seed_chart(p_books uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO gl_accounts (accounting_entity_id, code, name, type)
  SELECT p_books, c, n, t FROM (VALUES
    ('1000','Operating Cash','asset'), ('1050','Stripe Clearing','asset'),
    ('2100','Security Deposits Held','liability'), ('3000','Owner Equity','equity'),
    ('4000','Rental Income','income'), ('4100','Late Fee Income','income'), ('4200','Other Tenant Income','income'),
    ('5000','Repairs & Maintenance','expense'), ('5100','Utilities','expense'), ('5200','Insurance','expense'),
    ('5300','Property Taxes','expense'), ('5400','Management Fees','expense'), ('5500','Cleaning','expense'),
    ('5600','Landscaping','expense'), ('5700','Supplies','expense'), ('5800','Legal & Professional','expense'),
    ('5850','Advertising','expense'), ('5900','HOA Dues','expense'), ('5990','Other Expenses','expense'),
    ('6100','Payment Processing Fees','expense')) AS s(c, n, t)
  ON CONFLICT (accounting_entity_id, code) DO NOTHING;
$$;

CREATE FUNCTION public.a1_books_seed_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM a1_seed_chart(NEW.id); RETURN NULL; END;
$$;
CREATE TRIGGER a1_seed_chart_on_books AFTER INSERT ON public.accounting_entities
  FOR EACH ROW EXECUTE FUNCTION public.a1_books_seed_trigger();

-- Category maps (single source of truth for posting, reconciliation and the UI list)
CREATE FUNCTION public.a1_payment_account(p_category text, OUT code text, OUT err text, OUT warn text)
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE c text := lower(btrim(coalesce(p_category, '')));
BEGIN
  IF c = '' THEN err := 'uncategorized_receipt';   -- needs classification; never assumed rent
  ELSIF c = 'rent' THEN code := '4000';
  ELSIF c IN ('late fee', 'late_fee', 'late fees') THEN code := '4100';
  ELSIF c ~ 'deposit' THEN code := '2100';
  ELSIF c ~ '(contribution|distribution|owner|draw|loan|capital)' THEN err := 'non_operating_category';
  ELSIF c IN ('pet fee', 'parking', 'storage', 'utilities', 'laundry', 'other') THEN code := '4200';
  ELSE err := 'unknown_category';
  END IF;
END;
$$;

CREATE FUNCTION public.a1_expense_account(p_category text, OUT code text, OUT err text)
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE c text := lower(btrim(coalesce(p_category, '')));
BEGIN
  IF c ~ '(mortgage|principal|distribution|contribution|deposit|capital|loan|owner draw)' THEN err := 'non_operating_category';
  ELSIF c IN ('maintenance', 'repairs', 'repairs & maintenance') THEN code := '5000';
  ELSIF c = 'utilities' THEN code := '5100';
  ELSIF c = 'insurance' THEN code := '5200';
  ELSIF c IN ('property tax', 'property taxes', 'taxes') THEN code := '5300';
  ELSIF c IN ('management fee', 'management fees') THEN code := '5400';
  ELSIF c = 'cleaning' THEN code := '5500';
  ELSIF c = 'landscaping' THEN code := '5600';
  ELSIF c = 'supplies' THEN code := '5700';
  ELSIF c IN ('legal & professional', 'professional fees', 'legal') THEN code := '5800';
  ELSIF c = 'advertising' THEN code := '5850';
  ELSIF c IN ('hoa', 'hoa dues') THEN code := '5900';
  ELSIF c = 'other' THEN code := '5990';
  ELSE err := 'unknown_category';
  END IF;
END;
$$;

-- Exception bookkeeping
CREATE FUNCTION public.a1_note(p_type text, p_id uuid, p_code text, p_severity text, p_detail text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO posting_exceptions (source_type, source_id, code, severity, detail)
  VALUES (p_type, p_id, p_code, p_severity, p_detail)
  ON CONFLICT (source_type, source_id, code)
  DO UPDATE SET severity = EXCLUDED.severity, detail = EXCLUDED.detail, last_seen = now(), resolved_at = NULL;
$$;
CREATE FUNCTION public.a1_resolve_others(p_type text, p_id uuid, p_keep text[]) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE posting_exceptions SET resolved_at = now()
  WHERE source_type = p_type AND source_id = p_id AND resolved_at IS NULL AND NOT (code = ANY (coalesce(p_keep, '{}')));
$$;

-- Reverse one entry (dated today, America/New_York)
CREATE FUNCTION public.a1_reverse_entry(p_entry uuid, p_memo text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o journal_entries; v_id uuid;
BEGIN
  SELECT * INTO o FROM journal_entries WHERE id = p_entry;
  INSERT INTO journal_entries (accounting_entity_id, entry_date, memo, source_type, source_id, source_version, kind, reverses_entry_id, signature)
  VALUES (o.accounting_entity_id, (now() AT TIME ZONE 'America/New_York')::date, p_memo,
          o.source_type, o.source_id, o.source_version, 'reversal', o.id, o.signature)
  RETURNING id INTO v_id;
  INSERT INTO journal_lines (journal_entry_id, account_id, debit_cents, credit_cents, property_id, unit_id, tenant_id, memo)
  SELECT v_id, account_id, credit_cents, debit_cents, property_id, unit_id, tenant_id, memo
  FROM journal_lines WHERE journal_entry_id = o.id;
  RETURN v_id;
END;
$$;

-- Active (posted, not reversed) entry for a source
CREATE FUNCTION public.a1_active_entry(p_type text, p_id uuid) RETURNS journal_entries
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT je.* FROM journal_entries je
  WHERE je.source_type = p_type AND je.source_id = p_id AND je.kind = 'post'
    AND NOT EXISTS (SELECT 1 FROM journal_entries r WHERE r.reverses_entry_id = je.id)
  ORDER BY je.source_version DESC LIMIT 1;
$$;

-- Classification of one payment row (shared by posting and reconciliation)
CREATE FUNCTION public.a1_classify_payment(p payments,
  OUT qualifies boolean, OUT excluded_reason text, OUT err text, OUT warnings text[],
  OUT amount_cents bigint, OUT fee_cents bigint, OUT entry_date date, OUT books uuid,
  OUT property_id uuid, OUT unit_id uuid, OUT debit_code text, OUT credit_code text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE m record; v_unit uuid; v_dollars bigint;
BEGIN
  qualifies := false; warnings := '{}';
  IF p.id IS NULL THEN excluded_reason := 'deleted'; RETURN; END IF;
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

CREATE FUNCTION public.a1_classify_expense(e expenses,
  OUT qualifies boolean, OUT excluded_reason text, OUT err text,
  OUT amount_cents bigint, OUT entry_date date, OUT books uuid, OUT property_id uuid, OUT unit_id uuid, OUT debit_code text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE m record;
BEGIN
  qualifies := false;
  IF e.id IS NULL THEN excluded_reason := 'deleted'; RETURN; END IF;
  IF e.voided_at IS NOT NULL THEN excluded_reason := 'void'; RETURN; END IF;
  IF e.paid_at IS NULL THEN err := 'needs_paid_date'; RETURN; END IF;   -- unpaid / unconfirmed: action needed
  amount_cents := CASE WHEN e.amount IS NULL THEN NULL ELSE round(e.amount * 100)::bigint END;
  IF amount_cents IS NULL OR amount_cents <= 0 THEN err := 'missing_or_nonpositive_amount'; RETURN; END IF;
  SELECT * INTO m FROM a1_expense_account(e.category);
  IF m.err IS NOT NULL THEN err := m.err; RETURN; END IF;
  debit_code := m.code;
  property_id := e.property_id; unit_id := e.unit_id;
  IF property_id IS NULL AND unit_id IS NOT NULL THEN SELECT u.property_id INTO property_id FROM units u WHERE u.id = unit_id; END IF;
  IF property_id IS NULL THEN err := 'no_property'; RETURN; END IF;
  SELECT pr.accounting_entity_id INTO books FROM properties pr WHERE pr.id = property_id;
  IF books IS NULL THEN err := 'property_without_books'; RETURN; END IF;
  entry_date := e.paid_at;
  qualifies := true;
END;
$$;

-- Bring the ledger in line with one source row. Idempotent: running it again with
-- unchanged inputs changes nothing.
CREATE FUNCTION public.a1_sync(p_type text, p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pay payments; v_exp expenses; cp record; ce record; a journal_entries;
  v_sig jsonb; v_entry uuid; v_ver int; v_memo text; v_keep text[] := '{}'; v_w text;
  v_q boolean; v_err text; v_excl text; v_warn text[] := '{}';
  v_amount bigint; v_fee_cents bigint := 0; v_date date; v_books uuid; v_prop uuid; v_unit uuid; v_tenant uuid;
  v_debit_code text; v_credit_code text;
  v_debit uuid; v_credit uuid; v_fee uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_type || ':' || p_id::text, 0));
  a := a1_active_entry(p_type, p_id);

  -- Classify into plain scalars (one record variable per source type keeps plan caching stable)
  IF p_type = 'payment' THEN
    SELECT * INTO v_pay FROM payments WHERE id = p_id;
    SELECT * INTO cp FROM a1_classify_payment(v_pay);
    v_q := cp.qualifies; v_err := cp.err; v_excl := cp.excluded_reason; v_warn := coalesce(cp.warnings, '{}');
    v_amount := cp.amount_cents; v_fee_cents := coalesce(cp.fee_cents, 0); v_date := cp.entry_date; v_books := cp.books;
    v_prop := cp.property_id; v_unit := cp.unit_id; v_tenant := v_pay.tenant_id;
    v_debit_code := cp.debit_code; v_credit_code := cp.credit_code;
    v_memo := 'Receipt' || coalesce(' · ' || nullif(btrim(v_pay.category), ''), '');
  ELSIF p_type = 'expense' THEN
    SELECT * INTO v_exp FROM expenses WHERE id = p_id;
    SELECT * INTO ce FROM a1_classify_expense(v_exp);
    v_q := ce.qualifies; v_err := ce.err; v_excl := ce.excluded_reason;
    v_amount := ce.amount_cents; v_date := ce.entry_date; v_books := ce.books;
    v_prop := ce.property_id; v_unit := ce.unit_id; v_tenant := NULL;
    v_debit_code := ce.debit_code; v_credit_code := '1000';
    v_memo := coalesce(nullif(btrim(v_exp.description), ''), 'Expense') || coalesce(' · ' || nullif(btrim(v_exp.vendor_name), ''), '');
  ELSE
    RAISE EXCEPTION 'A1: unknown source type %', p_type;
  END IF;

  IF v_q THEN
    v_sig := jsonb_build_object('amount', v_amount, 'fee', v_fee_cents, 'date', v_date, 'books', v_books,
      'property', v_prop, 'unit', v_unit, 'tenant', v_tenant, 'debit', v_debit_code, 'credit', v_credit_code);
  END IF;

  -- Unchanged and already posted: nothing to do (idempotency)
  IF v_q AND a.id IS NOT NULL AND a.signature = v_sig THEN
    FOREACH v_w IN ARRAY v_warn LOOP PERFORM a1_note(p_type, p_id, v_w, 'warning', NULL); END LOOP;
    PERFORM a1_resolve_others(p_type, p_id, v_warn);
    RETURN;
  END IF;

  -- Stopped qualifying, changed, or deleted: reverse the active entry
  IF a.id IS NOT NULL THEN
    PERFORM a1_reverse_entry(a.id, 'Reversal: ' || CASE WHEN v_q THEN 'source changed' ELSE coalesce(v_err, v_excl, 'no longer qualifies') END);
  END IF;

  IF NOT v_q THEN
    IF v_err IS NOT NULL THEN
      PERFORM a1_note(p_type, p_id, v_err, 'error', v_excl);
      v_keep := ARRAY[v_err];
    END IF;
    PERFORM a1_resolve_others(p_type, p_id, v_keep);
    RETURN;
  END IF;

  -- Post the new version
  SELECT id INTO v_debit  FROM gl_accounts WHERE accounting_entity_id = v_books AND code = v_debit_code;
  SELECT id INTO v_credit FROM gl_accounts WHERE accounting_entity_id = v_books AND code = v_credit_code;
  SELECT id INTO v_fee    FROM gl_accounts WHERE accounting_entity_id = v_books AND code = '6100';
  IF v_debit IS NULL OR v_credit IS NULL OR v_fee IS NULL THEN
    RAISE EXCEPTION 'A1: chart of accounts incomplete for books %', v_books;
  END IF;

  SELECT coalesce(max(source_version), 0) + 1 INTO v_ver FROM journal_entries WHERE source_type = p_type AND source_id = p_id;
  INSERT INTO journal_entries (accounting_entity_id, entry_date, memo, source_type, source_id, source_version, kind, signature)
  VALUES (v_books, v_date, v_memo, p_type, p_id, v_ver, 'post', v_sig)
  RETURNING id INTO v_entry;

  -- One statement, so the balance check sees the complete entry
  INSERT INTO journal_lines (journal_entry_id, account_id, debit_cents, credit_cents, property_id, unit_id, tenant_id)
  SELECT v_entry, x.acct, x.dr, x.cr, v_prop, v_unit, v_tenant FROM (VALUES
    (v_debit,  v_amount, 0::bigint),
    (v_credit, 0::bigint, v_amount),
    (v_fee,    v_fee_cents, 0::bigint),     -- Stripe platform fee (receipts only; 0 otherwise)
    (v_debit,  0::bigint, v_fee_cents)) AS x(acct, dr, cr)
  WHERE x.dr > 0 OR x.cr > 0;

  FOREACH v_w IN ARRAY v_warn LOOP PERFORM a1_note(p_type, p_id, v_w, 'warning', NULL); END LOOP;
  PERFORM a1_resolve_others(p_type, p_id, v_warn);
END;
$$;

-- Non-blocking source triggers: a posting failure is recorded (persisted with the source
-- write) and never aborts the payment / expense write. Reconciliation also detects any
-- qualifying source without an active entry, independent of this log.
CREATE FUNCTION public.a1_source_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_type text := TG_ARGV[0]; v_id uuid;
BEGIN
  v_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  BEGIN
    PERFORM a1_sync(v_type, v_id);
  EXCEPTION WHEN OTHERS THEN
    PERFORM a1_note(v_type, v_id, 'posting_failed', 'error', left(SQLERRM, 500));
  END;
  RETURN NULL;
END;
$$;
CREATE TRIGGER a1_post_payments AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.a1_source_trigger('payment');
CREATE TRIGGER a1_post_expenses AFTER INSERT OR UPDATE OR DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.a1_source_trigger('expense');

-- Idempotent backfill / re-sync of all history
CREATE FUNCTION public.a1_backfill() RETURNS TABLE (source_type text, processed int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n_p int := 0; n_e int := 0;
BEGIN
  FOR r IN SELECT id FROM payments ORDER BY created_at, id LOOP
    BEGIN PERFORM a1_sync('payment', r.id);
    EXCEPTION WHEN OTHERS THEN PERFORM a1_note('payment', r.id, 'posting_failed', 'error', left(SQLERRM, 500)); END;
    n_p := n_p + 1;
  END LOOP;
  FOR r IN SELECT id FROM expenses ORDER BY date, id LOOP
    BEGIN PERFORM a1_sync('expense', r.id);
    EXCEPTION WHEN OTHERS THEN PERFORM a1_note('expense', r.id, 'posting_failed', 'error', left(SQLERRM, 500)); END;
    n_e := n_e + 1;
  END LOOP;
  RETURN QUERY VALUES ('payment'::text, n_p), ('expense'::text, n_e);
END;
$$;


-- ============================================================
-- PART 4: Read API (SECURITY INVOKER + RLS; landlord only)
-- Scope: 'portfolio' | 'owner' (ownership_entities.id) | 'books' (accounting_entities.id)
--        | 'property' (properties.id)
-- Only posted entries (and their reversals) in the selected books are counted.
-- ============================================================
CREATE FUNCTION public.a1_scoped_lines(p_from date, p_to date, p_scope text, p_scope_id uuid)
RETURNS TABLE (entry_id uuid, entry_date date, memo text, source_type text, source_id uuid, kind text,
               books uuid, account_code text, account_name text, account_type text,
               debit_cents bigint, credit_cents bigint, property_id uuid, tenant_id uuid)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT je.id, je.entry_date, je.memo, je.source_type, je.source_id, je.kind, je.accounting_entity_id,
         a.code, a.name, a.type, l.debit_cents, l.credit_cents, l.property_id, l.tenant_id
  FROM journal_entries je
  JOIN journal_lines l ON l.journal_entry_id = je.id
  JOIN gl_accounts a   ON a.id = l.account_id
  JOIN accounting_entities ae ON ae.id = je.accounting_entity_id
  WHERE is_landlord()
    AND je.entry_date BETWEEN p_from AND p_to
    AND CASE coalesce(p_scope, 'portfolio')
          WHEN 'portfolio' THEN true
          WHEN 'owner'     THEN ae.owner_entity_id = p_scope_id
          WHEN 'books'     THEN je.accounting_entity_id = p_scope_id
          WHEN 'property'  THEN l.property_id = p_scope_id
          ELSE false END;
$$;

CREATE FUNCTION public.a1_income_statement(p_from date, p_to date, p_scope text DEFAULT 'portfolio', p_scope_id uuid DEFAULT NULL)
RETURNS TABLE (account_type text, account_code text, account_name text, amount_cents bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT account_type, account_code, account_name,
         sum(CASE WHEN account_type = 'income' THEN credit_cents - debit_cents ELSE debit_cents - credit_cents END)::bigint
  FROM a1_scoped_lines(p_from, p_to, p_scope, p_scope_id)
  WHERE account_type IN ('income', 'expense')
  GROUP BY account_type, account_code, account_name
  HAVING sum(debit_cents) + sum(credit_cents) > 0
  ORDER BY account_code;
$$;

CREATE FUNCTION public.a1_account_transactions(p_from date, p_to date, p_scope text, p_scope_id uuid, p_account_code text)
RETURNS TABLE (entry_id uuid, entry_date date, memo text, kind text, source_type text, source_id uuid,
               books_name text, property_name text, tenant_name text, amount_cents bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT s.entry_id, s.entry_date, s.memo, s.kind, s.source_type, s.source_id, ae.name, pr.name, t.name,
         (CASE WHEN s.account_type = 'income' THEN s.credit_cents - s.debit_cents ELSE s.debit_cents - s.credit_cents END)::bigint
  FROM a1_scoped_lines(p_from, p_to, p_scope, p_scope_id) s
  JOIN accounting_entities ae ON ae.id = s.books
  LEFT JOIN properties pr ON pr.id = s.property_id
  LEFT JOIN tenants t ON t.id = s.tenant_id
  WHERE s.account_code = p_account_code
  ORDER BY s.entry_date, s.entry_id;
$$;

-- Reconciliation: per books, cash recognised by the posting rules from the source tables
-- vs. what the ledger holds; plus unposted qualifying sources.
CREATE FUNCTION public.a1_reconciliation()
RETURNS TABLE (books uuid, books_name text, source_type text, source_cents bigint, ledger_cents bigint,
               source_count int, unposted_count int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$   -- definer: classifies all rows; landlord-gated below
  WITH pay AS (
    SELECT p.id, c.* FROM payments p CROSS JOIN LATERAL a1_classify_payment(p) c WHERE c.qualifies
  ), exp AS (
    SELECT e.id, c.* FROM expenses e CROSS JOIN LATERAL a1_classify_expense(e) c WHERE c.qualifies
  ), src AS (
    SELECT 'payment' st, id, books, amount_cents FROM pay
    UNION ALL SELECT 'expense', id, books, amount_cents FROM exp
  ), led AS (
    -- net gross amount per source in the ledger (receipts: cash debit before fees; expenses: expense debit)
    SELECT je.source_type st, je.accounting_entity_id books,
           sum(CASE WHEN je.kind = 'post' THEN 1 ELSE -1 END * (je.signature->>'amount')::bigint) cents
    FROM journal_entries je GROUP BY 1, 2
  )
  SELECT ae.id, ae.name, st.st,
         coalesce((SELECT sum(amount_cents) FROM src WHERE src.books = ae.id AND src.st = st.st), 0)::bigint,
         coalesce((SELECT cents FROM led WHERE led.books = ae.id AND led.st = st.st), 0)::bigint,
         (SELECT count(*) FROM src WHERE src.books = ae.id AND src.st = st.st)::int,
         (SELECT count(*) FROM src WHERE src.books = ae.id AND src.st = st.st
            AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.source_type = src.st AND je.source_id = src.id AND je.kind = 'post'
                              AND NOT EXISTS (SELECT 1 FROM journal_entries r WHERE r.reverses_entry_id = je.id)))::int
  FROM accounting_entities ae CROSS JOIN (VALUES ('payment'), ('expense')) st(st)
  WHERE is_landlord()
  ORDER BY ae.name, st.st;
$$;

-- Open exceptions with enough context to act on them
CREATE FUNCTION public.a1_open_exceptions()
RETURNS TABLE (source_type text, source_id uuid, code text, severity text, detail text, last_seen timestamptz,
               amount_cents bigint, source_date date, description text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT x.source_type, x.source_id, x.code, x.severity, x.detail, x.last_seen,
         CASE x.source_type WHEN 'payment' THEN coalesce(p.amount_cents, round(p.amount * 100)::bigint)
                            ELSE round(e.amount * 100)::bigint END,
         CASE x.source_type WHEN 'payment' THEN (p.paid_at AT TIME ZONE 'America/New_York')::date
                            ELSE coalesce(e.paid_at, e.date) END,
         CASE x.source_type WHEN 'payment' THEN concat_ws(' · ', t.name, nullif(p.category, ''), p.status,
                                                   CASE WHEN p.paid_at IS NULL THEN 'recorded ' || (p.created_at AT TIME ZONE 'America/New_York')::date END)
                            ELSE concat_ws(' · ', nullif(e.description, ''), nullif(e.vendor_name, ''), e.category) END
  FROM posting_exceptions x
  LEFT JOIN payments p ON x.source_type = 'payment' AND p.id = x.source_id
  LEFT JOIN tenants t  ON t.id = p.tenant_id
  LEFT JOIN expenses e ON x.source_type = 'expense' AND e.id = x.source_id
  WHERE x.resolved_at IS NULL AND is_landlord()
  ORDER BY x.severity, x.last_seen DESC;
$$;


-- ============================================================
-- PART 5: Privileges / RLS
-- ============================================================
ALTER TABLE public.gl_accounts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_lines      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posting_exceptions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.gl_accounts, public.journal_entries, public.journal_lines, public.posting_exceptions
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.gl_accounts, public.journal_entries, public.journal_lines, public.posting_exceptions TO authenticated;
GRANT ALL    ON public.gl_accounts, public.journal_entries, public.journal_lines, public.posting_exceptions TO service_role;

CREATE POLICY "a1_landlord_read_gl_accounts"        ON public.gl_accounts        FOR SELECT TO authenticated USING (is_landlord());
CREATE POLICY "a1_landlord_read_journal_entries"    ON public.journal_entries    FOR SELECT TO authenticated USING (is_landlord());
CREATE POLICY "a1_landlord_read_journal_lines"      ON public.journal_lines      FOR SELECT TO authenticated USING (is_landlord());
CREATE POLICY "a1_landlord_read_posting_exceptions" ON public.posting_exceptions FOR SELECT TO authenticated USING (is_landlord());

-- Engine functions: never callable by API clients
REVOKE EXECUTE ON FUNCTION public.a1_seed_chart(uuid), public.a1_books_seed_trigger(), public.a1_note(text, uuid, text, text, text),
  public.a1_resolve_others(text, uuid, text[]), public.a1_reverse_entry(uuid, text), public.a1_active_entry(text, uuid),
  public.a1_classify_payment(payments), public.a1_classify_expense(expenses), public.a1_sync(text, uuid),
  public.a1_source_trigger(), public.a1_backfill(), public.a1_check_lines(), public.a1_append_only()
  FROM PUBLIC, anon, authenticated;

-- Read API: authenticated (each function also requires is_landlord())
REVOKE EXECUTE ON FUNCTION public.a1_scoped_lines(date, date, text, uuid), public.a1_income_statement(date, date, text, uuid),
  public.a1_account_transactions(date, date, text, uuid, text), public.a1_reconciliation(), public.a1_open_exceptions(),
  public.a1_payment_account(text), public.a1_expense_account(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.a1_scoped_lines(date, date, text, uuid), public.a1_income_statement(date, date, text, uuid),
  public.a1_account_transactions(date, date, text, uuid, text), public.a1_reconciliation(), public.a1_open_exceptions(),
  public.a1_payment_account(text), public.a1_expense_account(text)
  TO authenticated;


-- ============================================================
-- PART 6: Seed + backfill + postconditions
-- ============================================================
SELECT public.a1_seed_chart(id) FROM public.accounting_entities;
SELECT * FROM public.a1_backfill();

DO $$
DECLARE v_bad text; v_n int;
BEGIN
  -- every set of books has the full chart
  SELECT string_agg(name, ', ') INTO v_bad FROM accounting_entities ae
  WHERE (SELECT count(*) FROM gl_accounts a WHERE a.accounting_entity_id = ae.id) <> 20;
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'A1 postcheck: chart of accounts incomplete for %', v_bad; END IF;

  -- every entry balanced with >= 2 lines
  SELECT count(*) INTO v_n FROM journal_entries je
  WHERE (SELECT coalesce(sum(debit_cents - credit_cents), 0) FROM journal_lines l WHERE l.journal_entry_id = je.id) <> 0
     OR (SELECT count(*) FROM journal_lines l WHERE l.journal_entry_id = je.id) < 2;
  IF v_n > 0 THEN RAISE EXCEPTION 'A1 postcheck: % unbalanced entries', v_n; END IF;

  -- every qualifying source posted exactly once; ledger totals equal source totals
  IF EXISTS (SELECT 1 FROM payments p CROSS JOIN LATERAL a1_classify_payment(p) c
             WHERE c.qualifies AND (SELECT count(*) FROM journal_entries je WHERE je.source_type = 'payment' AND je.source_id = p.id
                                      AND je.kind = 'post' AND NOT EXISTS (SELECT 1 FROM journal_entries r WHERE r.reverses_entry_id = je.id)) <> 1)
     OR EXISTS (SELECT 1 FROM expenses e CROSS JOIN LATERAL a1_classify_expense(e) c
             WHERE c.qualifies AND (SELECT count(*) FROM journal_entries je WHERE je.source_type = 'expense' AND je.source_id = e.id
                                      AND je.kind = 'post' AND NOT EXISTS (SELECT 1 FROM journal_entries r WHERE r.reverses_entry_id = je.id)) <> 1) THEN
    RAISE EXCEPTION 'A1 postcheck: a qualifying source is not posted exactly once';
  END IF;
  -- nothing non-qualifying is in the ledger
  IF EXISTS (SELECT 1 FROM journal_entries je WHERE je.kind = 'post'
               AND NOT EXISTS (SELECT 1 FROM journal_entries r WHERE r.reverses_entry_id = je.id)
               AND NOT (CASE je.source_type
                 WHEN 'payment' THEN coalesce((SELECT c.qualifies FROM payments p CROSS JOIN LATERAL a1_classify_payment(p) c WHERE p.id = je.source_id), false)
                 ELSE coalesce((SELECT c.qualifies FROM expenses e CROSS JOIN LATERAL a1_classify_expense(e) c WHERE e.id = je.source_id), false) END)) THEN
    RAISE EXCEPTION 'A1 postcheck: ledger holds an entry for a non-qualifying source';
  END IF;

  -- RLS / privileges
  SELECT string_agg(t, ', ') INTO v_bad FROM unnest(ARRAY['gl_accounts','journal_entries','journal_lines','posting_exceptions']) t
  WHERE NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || t)::regclass)
     OR has_table_privilege('anon', 'public.' || t, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE')
     OR has_table_privilege('authenticated', 'public.' || t, 'INSERT, UPDATE, DELETE, TRUNCATE');
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'A1 postcheck: ledger privileges wrong on %', v_bad; END IF;
  IF has_function_privilege('authenticated', 'public.a1_sync(text, uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.a1_backfill()', 'EXECUTE') THEN
    RAISE EXCEPTION 'A1 postcheck: posting engine callable by clients';
  END IF;

  RAISE NOTICE 'A1 postchecks passed.';
END $$;


-- ============================================================
-- PART 7: Behaviour checks (synthetic fixtures; rolled back to the savepoint)
-- ============================================================
SAVEPOINT a1_verify;

DO $$
DECLARE
  v_books_a uuid; v_books_b uuid; v_prop_a uuid := gen_random_uuid(); v_prop_b uuid := gen_random_uuid();
  v_unit_a uuid := gen_random_uuid(); v_unit_b uuid := gen_random_uuid();
  v_ten_a uuid := gen_random_uuid(); v_ten_b uuid := gen_random_uuid();
  v_p1 uuid := gen_random_uuid(); v_p2 uuid := gen_random_uuid(); v_p3 uuid := gen_random_uuid();
  v_p4 uuid := gen_random_uuid(); v_p5 uuid := gen_random_uuid(); v_e1 uuid := gen_random_uuid(); v_e2 uuid := gen_random_uuid();
  v_n int; v_inc bigint; v_exp bigint; v_rinc bigint; v_rexp bigint; v_landlord uuid;
BEGIN
  SELECT id INTO v_books_a FROM accounting_entities ORDER BY name LIMIT 1;
  SELECT id INTO v_books_b FROM accounting_entities ORDER BY name DESC LIMIT 1;
  INSERT INTO properties (id, name, address, city, state, zip, accounting_entity_id) VALUES
    (v_prop_a, 'A1 verify A', '1 A St', 'X', 'OH', '00000', v_books_a),
    (v_prop_b, 'A1 verify B', '2 B St', 'X', 'OH', '00000', v_books_b);
  INSERT INTO units (id, property_id, unit_number, rent_amount) VALUES (v_unit_a, v_prop_a, 'A', 1000), (v_unit_b, v_prop_b, 'B', 1000);
  INSERT INTO tenants (id, name, email, unit_id) VALUES (v_ten_a, 'A1 Tenant A', 'a1a@test.invalid', v_unit_a),
                                                        (v_ten_b, 'A1 Tenant B', 'a1b@test.invalid', v_unit_b);
  -- receipts, a charge, a failed payment, a refund-to-be
  INSERT INTO payments (id, tenant_id, unit_id, category, amount_cents, status, paid_at) VALUES
    (v_p1, v_ten_a, v_unit_a, 'Rent', 100000, 'paid', '2099-01-05'),
    (v_p2, v_ten_b, v_unit_b, 'Rent', 150000, 'paid', '2099-01-06');
  INSERT INTO payments (id, tenant_id, category, amount, amount_cents, balance_due, due_date, status) VALUES
    (v_p3, v_ten_a, 'Late Fee', 50, 5000, 50, '2099-01-06', 'Unpaid');
  INSERT INTO payments (id, tenant_id, unit_id, amount_cents, status) VALUES (v_p4, v_ten_a, v_unit_a, 7000, 'failed');
  INSERT INTO payments (id, tenant_id, unit_id, category, amount_cents, status, paid_at) VALUES (v_p5, v_ten_a, v_unit_a, 'Rent', 20000, 'paid', '2099-01-07');
  INSERT INTO expenses (id, property_id, category, description, amount, date, paid_at) VALUES
    (v_e1, v_prop_a, 'maintenance', 'A1 verify plumbing', 300, '2099-01-10', '2099-01-10');
  INSERT INTO expenses (id, property_id, category, description, amount, date) VALUES
    (v_e2, v_prop_a, 'maintenance', 'A1 verify unpaid', 999, '2099-01-11');

  -- refund: p5 leaves 'paid' → reversal
  UPDATE payments SET status = 'refunded' WHERE id = v_p5;
  -- retry the posting of everything: no duplicates
  PERFORM a1_sync('payment', v_p1); PERFORM a1_sync('payment', v_p1); PERFORM a1_sync('expense', v_e1);

  SELECT count(*) INTO v_n FROM journal_entries WHERE source_id IN (v_p1, v_p2, v_p3, v_p4, v_p5, v_e1, v_e2);
  IF v_n <> 5 THEN RAISE EXCEPTION 'A1 verify: expected 5 entries (p1, p2, p5 + its reversal, e1), found %', v_n; END IF;

  -- books A for Jan 2099 (reversal of p5 is dated today, outside the window), straight from the ledger
  SELECT coalesce(sum(l.credit_cents - l.debit_cents) FILTER (WHERE a.type = 'income'), 0),
         coalesce(sum(l.debit_cents - l.credit_cents) FILTER (WHERE a.type = 'expense'), 0)
    INTO v_inc, v_exp
    FROM journal_entries je JOIN journal_lines l ON l.journal_entry_id = je.id JOIN gl_accounts a ON a.id = l.account_id
   WHERE je.accounting_entity_id = v_books_a AND je.entry_date BETWEEN '2099-01-01' AND '2099-01-31';
  IF v_books_a <> v_books_b AND (v_inc <> 120000 OR v_exp <> 30000) THEN
    RAISE EXCEPTION 'A1 verify: books A income/expense % / % (expected 120000 / 30000)', v_inc, v_exp;
  END IF;

  -- the report RPC returns the same figures for a landlord (identity is local to this savepoint)
  SELECT id INTO v_landlord FROM profiles WHERE role = 'landlord' ORDER BY id LIMIT 1;
  IF v_landlord IS NOT NULL THEN
    PERFORM set_config('request.jwt.claim.sub', v_landlord::text, true);
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_landlord, 'role', 'authenticated')::text, true);
    SELECT coalesce(sum(amount_cents) FILTER (WHERE account_type = 'income'), 0),
           coalesce(sum(amount_cents) FILTER (WHERE account_type = 'expense'), 0)
      INTO v_rinc, v_rexp FROM a1_income_statement('2099-01-01', '2099-01-31', 'books', v_books_a);
    IF (v_rinc, v_rexp) IS DISTINCT FROM (v_inc, v_exp) THEN
      RAISE EXCEPTION 'A1 verify: income statement RPC % / % differs from ledger % / %', v_rinc, v_rexp, v_inc, v_exp;
    END IF;
  END IF;

  -- unpaid expense and the outstanding late fee are not in the ledger; unpaid expense is an exception
  IF EXISTS (SELECT 1 FROM journal_entries WHERE source_id IN (v_p3, v_p4, v_e2)) THEN
    RAISE EXCEPTION 'A1 verify: a non-cash row was posted';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM posting_exceptions WHERE source_id = v_e2 AND code = 'needs_paid_date' AND resolved_at IS NULL) THEN
    RAISE EXCEPTION 'A1 verify: unpaid expense not reported';
  END IF;

  -- a direct ledger write by a client role is refused; ledger is append-only
  BEGIN
    UPDATE journal_lines SET debit_cents = debit_cents WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE source_id = v_p1);
    RAISE EXCEPTION 'A1 verify: ledger update allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

ROLLBACK TO SAVEPOINT a1_verify;
RELEASE SAVEPOINT a1_verify;

SELECT 'A1 ledger foundation applied and verified' AS result,
       (SELECT count(*) FROM journal_entries) AS entries_posted,
       (SELECT count(*) FROM posting_exceptions WHERE resolved_at IS NULL) AS open_exceptions;

COMMIT;


-- ============================================================
-- ROLLBACK (one transaction). Removes every A1 object. The two expenses columns are
-- dropped too, which discards any paid/void dates entered after deployment.
-- ============================================================
-- BEGIN;
-- DROP TRIGGER IF EXISTS a1_post_payments ON public.payments;
-- DROP TRIGGER IF EXISTS a1_post_expenses ON public.expenses;
-- DROP TRIGGER IF EXISTS a1_seed_chart_on_books ON public.accounting_entities;
-- DROP FUNCTION IF EXISTS public.a1_open_exceptions(), public.a1_reconciliation(),
--   public.a1_account_transactions(date, date, text, uuid, text), public.a1_income_statement(date, date, text, uuid),
--   public.a1_scoped_lines(date, date, text, uuid), public.a1_backfill(), public.a1_source_trigger(),
--   public.a1_sync(text, uuid), public.a1_classify_expense(expenses), public.a1_classify_payment(payments),
--   public.a1_active_entry(text, uuid), public.a1_reverse_entry(uuid, text), public.a1_resolve_others(text, uuid, text[]),
--   public.a1_note(text, uuid, text, text, text), public.a1_expense_account(text), public.a1_payment_account(text),
--   public.a1_books_seed_trigger(), public.a1_seed_chart(uuid);
-- DROP TABLE IF EXISTS public.journal_lines, public.journal_entries, public.posting_exceptions, public.gl_accounts;
-- DROP FUNCTION IF EXISTS public.a1_check_lines(), public.a1_append_only();
-- ALTER TABLE public.expenses DROP COLUMN IF EXISTS paid_at, DROP COLUMN IF EXISTS voided_at;
-- COMMIT;
