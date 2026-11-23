-- Local test fixture for Stripe ACH PR#2 integration testing.
-- Safe for local dev only. Contains NO production data, NO real credentials.
-- Run against: psql -h localhost -p 54322 -U postgres -d postgres -f this_file.sql

BEGIN;

-- a2_settings is a singleton populated by the A2 migration INSERT but schema-only
-- restore skips data, so ensure the row exists before updating it.
INSERT INTO public.a2_settings DEFAULT VALUES ON CONFLICT DO NOTHING;
UPDATE public.a2_settings SET cutover_date = '2026-11-01', cutover_set_at = now() WHERE id = true;

-- Auth users (local only, no real passwords).
-- GoTrue requires: instance_id, aud, encrypted_password (non-null),
-- and all *_token columns must be '' not NULL (GoTrue scans them as Go strings).
-- auth.instances must have a row for GoTrue to accept sign-ins.
INSERT INTO auth.instances (id, uuid, raw_base_config, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000000','{}',now(),now())
ON CONFLICT DO NOTHING;

INSERT INTO auth.users (
  id, instance_id, aud, role, email,
  encrypted_password,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  raw_app_meta_data, raw_user_meta_data, is_super_admin,
  email_confirmed_at, created_at, updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'landlord-test@localhost.invalid',
  crypt('LocTest-1234!', gen_salt('bf')),
  '', '', '', '',
  '{"provider":"email","providers":["email"]}', '{}', false,
  now(), now(), now()
) ON CONFLICT (id) DO UPDATE SET
  instance_id = EXCLUDED.instance_id,
  aud = EXCLUDED.aud,
  encrypted_password = EXCLUDED.encrypted_password,
  confirmation_token = EXCLUDED.confirmation_token,
  recovery_token = EXCLUDED.recovery_token,
  email_change_token_new = EXCLUDED.email_change_token_new,
  email_change = EXCLUDED.email_change,
  raw_app_meta_data = EXCLUDED.raw_app_meta_data,
  email_confirmed_at = COALESCE(auth.users.email_confirmed_at, EXCLUDED.email_confirmed_at),
  updated_at = now();

INSERT INTO auth.users (
  id, instance_id, aud, role, email,
  encrypted_password,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  raw_app_meta_data, raw_user_meta_data, is_super_admin,
  email_confirmed_at, created_at, updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'tenant-test@localhost.invalid',
  crypt('LocTest-1234!', gen_salt('bf')),
  '', '', '', '',
  '{"provider":"email","providers":["email"]}', '{}', false,
  now(), now(), now()
) ON CONFLICT (id) DO UPDATE SET
  instance_id = EXCLUDED.instance_id,
  aud = EXCLUDED.aud,
  encrypted_password = EXCLUDED.encrypted_password,
  confirmation_token = EXCLUDED.confirmation_token,
  recovery_token = EXCLUDED.recovery_token,
  email_change_token_new = EXCLUDED.email_change_token_new,
  email_change = EXCLUDED.email_change,
  raw_app_meta_data = EXCLUDED.raw_app_meta_data,
  email_confirmed_at = COALESCE(auth.users.email_confirmed_at, EXCLUDED.email_confirmed_at),
  updated_at = now();

-- Identities required for email+password sign-in via GoTrue
INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES (
  'landlord-test@localhost.invalid',
  '00000000-0000-0000-0000-000000000001',
  '{"sub":"00000000-0000-0000-0000-000000000001","email":"landlord-test@localhost.invalid"}',
  'email', now(), now(), now()
) ON CONFLICT DO NOTHING;
INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES (
  'tenant-test@localhost.invalid',
  '00000000-0000-0000-0000-000000000002',
  '{"sub":"00000000-0000-0000-0000-000000000002","email":"tenant-test@localhost.invalid"}',
  'email', now(), now(), now()
) ON CONFLICT DO NOTHING;

-- Profiles
INSERT INTO public.profiles (id, role, created_at)
VALUES ('00000000-0000-0000-0000-000000000001', 'landlord', now()) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id, role, created_at)
VALUES ('00000000-0000-0000-0000-000000000002', 'tenant', now()) ON CONFLICT (id) DO NOTHING;

-- Landlord: stripe_account_id is the sandbox fixture from docs/launch/stripe-ach-pr2-verification.md
INSERT INTO public.landlords (id, auth_user_id, email, stripe_account_id, stripe_onboarded, name, is_active)
VALUES ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001',
  'landlord-test@localhost.invalid', 'acct_1UVhe1HWTjHm1swg', true, 'Test Landlord LLC', true)
ON CONFLICT DO NOTHING;

-- Organization, ownership entity, accounting entity (books)
INSERT INTO public.organizations (id, name) VALUES ('00000000-0000-0000-0000-000000000005', 'Test Org') ON CONFLICT DO NOTHING;
INSERT INTO public.ownership_entities (id, org_id, name, type)
VALUES ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000005', 'Test Ownership Entity', 'individual')
ON CONFLICT DO NOTHING;
INSERT INTO public.accounting_entities (id, org_id, owner_entity_id, name)
VALUES ('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000020', 'Test Books')
ON CONFLICT DO NOTHING;

-- Property links owner_email to landlord so create-payment-intent can resolve the Connect account
INSERT INTO public.properties (id, name, address, city, state, zip, owner_email, accounting_entity_id)
VALUES ('00000000-0000-0000-0000-000000000040', '123 Test Street', '123 Test St',
  'Columbus', 'OH', '43201', 'landlord-test@localhost.invalid', '00000000-0000-0000-0000-000000000030')
ON CONFLICT DO NOTHING;

-- Unit
INSERT INTO public.units (id, property_id, unit_number, rent_amount)
VALUES ('00000000-0000-0000-0000-000000000050', '00000000-0000-0000-0000-000000000040', '1', 1500.00)
ON CONFLICT DO NOTHING;

-- Tenant
INSERT INTO public.tenants (id, unit_id, name, email, user_id, archived)
VALUES ('00000000-0000-0000-0000-000000000060', '00000000-0000-0000-0000-000000000050',
  'Test Tenant', 'tenant-test@localhost.invalid', '00000000-0000-0000-0000-000000000002', false)
ON CONFLICT DO NOTHING;

-- Recurring charge (lease/rent obligation); serves as schedule_id FK for tenant_charges
INSERT INTO public.recurring_charges (id, tenant_id, category, amount, start_date)
VALUES ('00000000-0000-0000-0000-000000000070', '00000000-0000-0000-0000-000000000060', 'Rent', 1500.00, '2026-11-01')
ON CONFLICT DO NOTHING;

-- November 2026 rent charge ($1,500 = 150000 cents)
-- Constraints: source='schedule' requires schedule_id NOT NULL (check2) and period NOT NULL (check3)
INSERT INTO public.tenant_charges (id, tenant_id, unit_id, category, amount_cents, charge_date, due_date, period, source, schedule_id, memo)
VALUES ('00000000-0000-0000-0000-000000000080', '00000000-0000-0000-0000-000000000060',
  '00000000-0000-0000-0000-000000000050', 'Rent', 150000, '2026-11-01', '2026-11-01', '2026-11',
  'schedule', '00000000-0000-0000-0000-000000000070', 'November 2026 Rent')
ON CONFLICT DO NOTHING;

-- Pre-verified bank account (fixture IDs; replace with real Stripe sandbox IDs when running live tests)
INSERT INTO public.tenant_payment_methods (id, tenant_id, stripe_customer_id, stripe_payment_method_id, bank_name, last4, status)
VALUES ('00000000-0000-0000-0000-000000000090', '00000000-0000-0000-0000-000000000060',
  'cus_test_local_fixture', 'pm_test_local_fixture', 'Test Bank', '6789', 'verified')
ON CONFLICT DO NOTHING;

SELECT 'Seed complete' AS status,
  (SELECT count(*) FROM auth.users WHERE id IN ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002')) AS auth_users,
  (SELECT count(*) FROM public.properties) AS properties,
  (SELECT count(*) FROM public.tenants) AS tenants,
  (SELECT count(*) FROM public.tenant_charges) AS charges,
  (SELECT amount_cents FROM public.tenant_charges WHERE id = '00000000-0000-0000-0000-000000000080') AS rent_cents,
  (SELECT cutover_date FROM public.a2_settings WHERE id = true) AS cutover_date;

COMMIT;
