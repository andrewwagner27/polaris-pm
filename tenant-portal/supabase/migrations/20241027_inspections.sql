-- ============================================================
-- Inspections table + storage bucket
-- 3-phase workflow: pre_move_in → awaiting_tenant → tenant_complete → closed
-- Run this in Supabase SQL Editor
-- ============================================================

-- Drop and recreate to pick up all columns cleanly
drop table if exists public.inspections cascade;

create table public.inspections (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants(id) on delete cascade,

  -- Phase 1: Landlord pre-move-in
  inspection_date      date,
  rooms                jsonb default '[]'::jsonb,         -- [{room, room_notes, items:[{name,status,notes}]}]
  landlord_notes       text,
  landlord_photos      jsonb default '[]'::jsonb,         -- [{url, room, caption}]

  -- Phase 2: Tenant move-in sign-off
  tenant_notes         text,
  tenant_photos        jsonb default '[]'::jsonb,         -- [{url, room, caption}]
  tenant_signature     text,
  tenant_signed_at     timestamptz,

  -- Phase 3: Move-out
  move_out_date        date,
  move_out_rooms       jsonb default '[]'::jsonb,         -- same shape as rooms
  move_out_notes       text,
  move_out_photos      jsonb default '[]'::jsonb,         -- [{url, room, caption}]
  deposit_deductions   jsonb default '[]'::jsonb,         -- [{description, amount}]
  total_deducted       numeric(10,2) default 0,
  deposit_held         numeric(10,2),                     -- total deposit amount held

  -- Lifecycle status
  status               text not null default 'awaiting_tenant'
                       check (status in ('awaiting_tenant','tenant_complete','closed')),

  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);

-- Updated-at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists set_inspections_updated_at on public.inspections;
create trigger set_inspections_updated_at
  before update on public.inspections
  for each row execute procedure public.set_updated_at();

-- Enable RLS
alter table public.inspections enable row level security;

-- Landlord: full access
create policy "Landlord full access"
  on public.inspections for all
  using  (auth.role() = 'authenticated' and exists (
    select 1 from public.tenants t where t.id = tenant_id
  ))
  with check (true);

-- Tenant: can read their own and update (for sign-off)
create policy "Tenant read own"
  on public.inspections for select
  using (exists (
    select 1 from public.tenants t
    where t.id = tenant_id and t.user_id = auth.uid()
  ));

create policy "Tenant update own"
  on public.inspections for update
  using (exists (
    select 1 from public.tenants t
    where t.id = tenant_id and t.user_id = auth.uid()
  ));

-- ============================================================
-- Storage bucket for inspection photos
-- ============================================================
insert into storage.buckets (id, name, public)
values ('inspection-photos', 'inspection-photos', true)
on conflict (id) do nothing;

-- Allow authenticated users to upload
drop policy if exists "Authenticated upload" on storage.objects;
create policy "Authenticated upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'inspection-photos');

-- Allow anyone to read (bucket is public)
drop policy if exists "Public read" on storage.objects;
create policy "Public read"
  on storage.objects for select
  using (bucket_id = 'inspection-photos');

-- Allow authenticated users to delete their uploads
drop policy if exists "Authenticated delete" on storage.objects;
create policy "Authenticated delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'inspection-photos');
