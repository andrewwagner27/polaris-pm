-- Validate changed tenant contact fields without requiring a cleanup of existing rows.
begin;

create or replace function public.validate_tenant_contact_phones()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  field text;
  phone_input text;
  digits text;
begin
  foreach field in array array['phone', 'emergency_contact_phone'] loop
    phone_input := to_jsonb(new) ->> field;
    if tg_op = 'UPDATE' and phone_input is not distinct from (to_jsonb(old) ->> field) then continue; end if;
    if nullif(btrim(phone_input), '') is null then continue; end if;
    phone_input := btrim(phone_input);
    digits := regexp_replace(phone_input, '[^0-9]', '', 'g');
    if phone_input !~ '^[+]?[0-9(). -]+$' or
       (left(phone_input, 1) = '+' and length(digits) <> 11) then
      raise exception 'Enter a valid US or Canadian phone number.' using errcode = '23514';
    end if;
    if length(digits) = 11 and left(digits, 1) = '1' then digits := substr(digits, 2); end if;
    if digits !~ '^[2-9][0-9]{2}[2-9][0-9]{6}$' or digits = repeat(left(digits, 1), 10) then
      raise exception 'Enter a valid US or Canadian phone number.' using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;

create trigger validate_tenant_contact_phones
before insert or update of phone, emergency_contact_phone on public.tenants
for each row execute function public.validate_tenant_contact_phones();

commit;
