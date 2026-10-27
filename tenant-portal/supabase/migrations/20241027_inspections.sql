-- Move-in inspections table
create table if not exists public.inspections (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  inspection_date     date,
  rooms               jsonb,
  landlord_notes      text,
  tenant_notes        text,
  tenant_photos       jsonb default '[]'::jsonb,
  tenant_signature    text,
  tenant_signed_at    timestamptz,
  status              text not null default 'landlord_complete'
                      check (status in ('landlord_complete','tenant_complete','both_complete')),
  created_by          text default 'landlord',
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

alter table public.inspections enable row level security;

create policy "Landlord full access to inspections"
  on public.inspections for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'landlord'
    )
  );

create policy "Tenant can view own inspection"
  on public.inspections for select
  using (
    exists (
      select 1 from public.tenants t
      where t.id = inspections.tenant_id and t.user_id = auth.uid()
    )
  );

create policy "Tenant can update own inspection"
  on public.inspections for update
  using (
    exists (
      select 1 from public.tenants t
      where t.id = inspections.tenant_id and t.user_id = auth.uid()
    )
  );

insert into storage.buckets (id, name, public)
  values ('inspection-photos', 'inspection-photos', true)
  on conflict do nothing;

create policy "Authenticated upload to inspection-photos"
  on storage.objects for insert
  with check (bucket_id = 'inspection-photos' and auth.role() = 'authenticated');

create policy "Public read inspection-photos"
  on storage.objects for select
  using (bucket_id = 'inspection-photos');
