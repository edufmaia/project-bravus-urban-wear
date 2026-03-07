-- 0003_handle_new_user_profile_metadata.sql
-- Unifica o fluxo de signup para depender apenas do trigger no banco.
-- O frontend envia first_name/last_name/company em raw_user_meta_data
-- e o trigger preenche users_profile mantendo a regra do primeiro ADMIN.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned_role text := 'VISUALIZADOR';
  reserved_admin uuid;
  meta_first_name text;
  meta_last_name text;
  meta_company text;
begin
  update public.app_settings
  set admin_user_id = new.id,
      updated_at = now()
  where id = 1
    and admin_user_id is null
  returning admin_user_id into reserved_admin;

  if reserved_admin is not null then
    assigned_role := 'ADMIN';
  end if;

  meta_first_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'first_name', '')), '');
  meta_last_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'last_name', '')), '');
  meta_company := nullif(trim(coalesce(new.raw_user_meta_data ->> 'company', '')), '');

  insert into public.users_profile (id, first_name, last_name, company, role, created_at, updated_at)
  values (new.id, meta_first_name, meta_last_name, meta_company, assigned_role, now(), now())
  on conflict (id) do update
  set first_name = coalesce(excluded.first_name, public.users_profile.first_name),
      last_name = coalesce(excluded.last_name, public.users_profile.last_name),
      company = coalesce(excluded.company, public.users_profile.company),
      updated_at = now();

  return new;
end;
$$;
