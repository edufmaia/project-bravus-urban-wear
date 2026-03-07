-- Bravus Urban Wear schema
create extension if not exists "pgcrypto";

create table if not exists public.users_profile (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  company text,
  role text check (role in ('ADMIN','GERENTE','OPERADOR','VISUALIZADOR')),
  created_at timestamp default now()
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  status text check (status in ('ATIVO','INATIVO')) default 'ATIVO',
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category text not null,
  collection text,
  supplier_id uuid references public.suppliers(id),
  status text check (status in ('ATIVO','INATIVO')) default 'ATIVO',
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table if not exists public.product_skus (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) not null,
  sku text unique not null,
  color text not null,
  size text not null,
  cost numeric(12,2) not null default 0,
  price numeric(12,2) not null default 0,
  stock_min int not null default 0,
  stock_current int not null default 0,
  status text check (status in ('ATIVO','INATIVO')) default 'ATIVO',
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  sku_id uuid references public.product_skus(id) not null,
  type text check (type in ('ENTRADA','SAIDA','AJUSTE')) not null,
  quantity int not null check (quantity > 0),
  signed_quantity int not null,
  reason text not null,
  notes text,
  occurred_at timestamp not null default now(),
  created_by uuid references auth.users(id),
  stock_after int not null default 0,
  created_at timestamp default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger suppliers_updated_at
  before update on public.suppliers
  for each row execute procedure public.set_updated_at();

create trigger products_updated_at
  before update on public.products
  for each row execute procedure public.set_updated_at();

create trigger product_skus_updated_at
  before update on public.product_skus
  for each row execute procedure public.set_updated_at();

create or replace function public.apply_stock_movement()
returns trigger language plpgsql as $$
declare
  current_stock int;
  new_stock int;
begin
  if new.signed_quantity is null then
    if new.type = 'ENTRADA' then
      new.signed_quantity := new.quantity;
    elsif new.type = 'SAIDA' then
      new.signed_quantity := -new.quantity;
    else
      new.signed_quantity := new.quantity;
    end if;
  end if;

  select stock_current into current_stock from public.product_skus where id = new.sku_id for update;
  new_stock := current_stock + new.signed_quantity;

  if new_stock < 0 then
    raise exception 'Estoque negativo não permitido';
  end if;

  update public.product_skus set stock_current = new_stock where id = new.sku_id;
  new.stock_after := new_stock;
  new.created_by := auth.uid();

  return new;
end;
$$;

drop trigger if exists stock_movement_trigger on public.stock_movements;
create trigger stock_movement_trigger
  before insert on public.stock_movements
  for each row execute procedure public.apply_stock_movement();

-- RLS
alter table public.users_profile enable row level security;
alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.product_skus enable row level security;
alter table public.stock_movements enable row level security;

create or replace function public.user_role()
returns text language sql stable as $$
  select role from public.users_profile where id = auth.uid();
$$;

create policy "users_profile_select" on public.users_profile
  for select using (auth.role() = 'authenticated');

create policy "users_profile_insert" on public.users_profile
  for insert with check (auth.uid() = id);

create policy "users_profile_update" on public.users_profile
  for update using (auth.uid() = id);

create policy "read_all_suppliers" on public.suppliers
  for select using (auth.role() = 'authenticated');

create policy "write_suppliers" on public.suppliers
  for all using (public.user_role() in ('ADMIN','GERENTE','OPERADOR'))
  with check (public.user_role() in ('ADMIN','GERENTE','OPERADOR'));

create policy "read_all_products" on public.products
  for select using (auth.role() = 'authenticated');

create policy "write_products" on public.products
  for all using (public.user_role() in ('ADMIN','GERENTE','OPERADOR'))
  with check (public.user_role() in ('ADMIN','GERENTE','OPERADOR'));

create policy "read_all_product_skus" on public.product_skus
  for select using (auth.role() = 'authenticated');

create policy "write_product_skus" on public.product_skus
  for all using (public.user_role() in ('ADMIN','GERENTE','OPERADOR'))
  with check (public.user_role() in ('ADMIN','GERENTE','OPERADOR'));

create policy "read_all_stock_movements" on public.stock_movements
  for select using (auth.role() = 'authenticated');

create policy "write_stock_movements" on public.stock_movements
  for all using (public.user_role() in ('ADMIN','GERENTE','OPERADOR'))
  with check (public.user_role() in ('ADMIN','GERENTE','OPERADOR'));
