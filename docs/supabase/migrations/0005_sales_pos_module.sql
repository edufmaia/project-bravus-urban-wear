-- 0005_sales_pos_module.sql
-- Modulo de vendas/PDV com fechamento atomico via RPC finalize_sale(payload jsonb).

-- Catalogo de pagamento
create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  type text not null check (type in ('CASH','CARD_CREDIT','CARD_DEBIT','PIX','OTHER')),
  active boolean not null default true,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table if not exists public.card_brands (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  active boolean not null default true,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create trigger payment_methods_updated_at
  before update on public.payment_methods
  for each row execute procedure public.set_updated_at();

create trigger card_brands_updated_at
  before update on public.card_brands
  for each row execute procedure public.set_updated_at();

-- Vendas
create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  number bigserial unique not null,
  status text not null default 'COMPLETED' check (status in ('OPEN','COMPLETED','CANCELED')),
  subtotal numeric(12,2) not null default 0,
  items_discount_total numeric(12,2) not null default 0,
  discount_total numeric(12,2) not null default 0,
  surcharge_total numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  paid_total numeric(12,2) not null default 0,
  change_total numeric(12,2) not null default 0,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create trigger sales_updated_at
  before update on public.sales
  for each row execute procedure public.set_updated_at();

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  sku_id uuid not null references public.product_skus(id),
  quantity int not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  total_amount numeric(12,2) not null check (total_amount >= 0),
  created_at timestamp default now()
);

create index if not exists sale_items_sale_id_idx on public.sale_items (sale_id);
create index if not exists sale_items_sku_id_idx on public.sale_items (sku_id);

create table if not exists public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  payment_method_id uuid not null references public.payment_methods(id),
  card_brand_id uuid references public.card_brands(id),
  amount numeric(12,2) not null check (amount > 0),
  installments int not null default 1 check (installments > 0),
  authorization_code text,
  notes text,
  created_at timestamp default now()
);

create index if not exists sale_payments_sale_id_idx on public.sale_payments (sale_id);

-- Rastreabilidade de origem no movimento de estoque
alter table public.stock_movements add column if not exists source_type text;
alter table public.stock_movements add column if not exists source_id uuid;
create index if not exists stock_movements_source_idx on public.stock_movements (source_type, source_id);

-- RLS
alter table public.payment_methods enable row level security;
alter table public.card_brands enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.sale_payments enable row level security;

drop policy if exists "read_all_payment_methods" on public.payment_methods;
create policy "read_all_payment_methods" on public.payment_methods
  for select using (auth.role() = 'authenticated');

drop policy if exists "write_payment_methods" on public.payment_methods;
create policy "write_payment_methods" on public.payment_methods
  for all using (public.user_role() in ('ADMIN','GERENTE'))
  with check (public.user_role() in ('ADMIN','GERENTE'));

drop policy if exists "read_all_card_brands" on public.card_brands;
create policy "read_all_card_brands" on public.card_brands
  for select using (auth.role() = 'authenticated');

drop policy if exists "write_card_brands" on public.card_brands;
create policy "write_card_brands" on public.card_brands
  for all using (public.user_role() in ('ADMIN','GERENTE'))
  with check (public.user_role() in ('ADMIN','GERENTE'));

drop policy if exists "read_all_sales" on public.sales;
create policy "read_all_sales" on public.sales
  for select using (auth.role() = 'authenticated');

drop policy if exists "insert_sales" on public.sales;
create policy "insert_sales" on public.sales
  for insert with check (public.user_role() in ('ADMIN','GERENTE','OPERADOR'));

drop policy if exists "update_sales" on public.sales;
create policy "update_sales" on public.sales
  for update using (public.user_role() in ('ADMIN','GERENTE'))
  with check (public.user_role() in ('ADMIN','GERENTE'));

drop policy if exists "delete_sales" on public.sales;
create policy "delete_sales" on public.sales
  for delete using (public.user_role() in ('ADMIN'));

drop policy if exists "read_all_sale_items" on public.sale_items;
create policy "read_all_sale_items" on public.sale_items
  for select using (auth.role() = 'authenticated');

drop policy if exists "insert_sale_items" on public.sale_items;
create policy "insert_sale_items" on public.sale_items
  for insert with check (public.user_role() in ('ADMIN','GERENTE','OPERADOR'));

drop policy if exists "update_sale_items" on public.sale_items;
create policy "update_sale_items" on public.sale_items
  for update using (public.user_role() in ('ADMIN','GERENTE'))
  with check (public.user_role() in ('ADMIN','GERENTE'));

drop policy if exists "delete_sale_items" on public.sale_items;
create policy "delete_sale_items" on public.sale_items
  for delete using (public.user_role() in ('ADMIN'));

drop policy if exists "read_all_sale_payments" on public.sale_payments;
create policy "read_all_sale_payments" on public.sale_payments
  for select using (auth.role() = 'authenticated');

drop policy if exists "insert_sale_payments" on public.sale_payments;
create policy "insert_sale_payments" on public.sale_payments
  for insert with check (public.user_role() in ('ADMIN','GERENTE','OPERADOR'));

drop policy if exists "update_sale_payments" on public.sale_payments;
create policy "update_sale_payments" on public.sale_payments
  for update using (public.user_role() in ('ADMIN','GERENTE'))
  with check (public.user_role() in ('ADMIN','GERENTE'));

drop policy if exists "delete_sale_payments" on public.sale_payments;
create policy "delete_sale_payments" on public.sale_payments
  for delete using (public.user_role() in ('ADMIN'));

create or replace function public.finalize_sale(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_items jsonb := coalesce(payload -> 'items', '[]'::jsonb);
  v_payments jsonb := coalesce(payload -> 'payments', '[]'::jsonb);
  v_sale_id uuid;
  v_sale_number bigint;
  v_subtotal numeric(12,2) := 0;
  v_items_discount_total numeric(12,2) := 0;
  v_discount_total numeric(12,2) := 0;
  v_surcharge_total numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_paid_total numeric(12,2) := 0;
  v_change_total numeric(12,2) := 0;
  v_item_count int := 0;
  v_payment_count int := 0;
  v_missing_sku text;
  v_fail_sku text;
  v_fail_stock int;
  v_fail_required int;
  v_missing_method text;
  v_missing_brand text;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  select role into v_role
  from public.users_profile
  where id = v_user_id;

  if v_role not in ('ADMIN','GERENTE','OPERADOR') then
    raise exception 'Perfil sem permissao para finalizar venda';
  end if;

  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'Payload invalido: items obrigatorio';
  end if;

  if jsonb_typeof(v_payments) <> 'array' or jsonb_array_length(v_payments) = 0 then
    raise exception 'Payload invalido: payments obrigatorio';
  end if;

  create temporary table if not exists pg_temp.tmp_finalize_sale_items (
    sku_id uuid,
    quantity int,
    unit_price numeric(12,2),
    discount_amount numeric(12,2)
  ) on commit drop;
  truncate table pg_temp.tmp_finalize_sale_items;

  insert into pg_temp.tmp_finalize_sale_items (sku_id, quantity, unit_price, discount_amount)
  select
    nullif(trim(coalesce(elem ->> 'sku_id', '')), '')::uuid,
    coalesce(nullif(trim(coalesce(elem ->> 'quantity', '')), '')::int, 0),
    coalesce(nullif(trim(coalesce(elem ->> 'unit_price', '')), '')::numeric, 0),
    coalesce(nullif(trim(coalesce(elem ->> 'discount_amount', '')), '')::numeric, 0)
  from jsonb_array_elements(v_items) elem;

  if exists (
    select 1
    from pg_temp.tmp_finalize_sale_items
    where sku_id is null
      or quantity <= 0
      or unit_price < 0
      or discount_amount < 0
      or discount_amount > (quantity * unit_price)
  ) then
    raise exception 'Payload invalido: items com sku/quantidade/preco/desconto inconsistentes';
  end if;

  create temporary table if not exists pg_temp.tmp_finalize_sale_required (
    sku_id uuid primary key,
    quantity_required int not null
  ) on commit drop;
  truncate table pg_temp.tmp_finalize_sale_required;

  insert into pg_temp.tmp_finalize_sale_required (sku_id, quantity_required)
  select sku_id, sum(quantity)
  from pg_temp.tmp_finalize_sale_items
  group by sku_id;

  select r.sku_id::text into v_missing_sku
  from pg_temp.tmp_finalize_sale_required r
  left join public.product_skus s on s.id = r.sku_id
  where s.id is null
  limit 1;

  if v_missing_sku is not null then
    raise exception 'SKU nao encontrado: %', v_missing_sku;
  end if;

  perform 1
  from public.product_skus s
  join pg_temp.tmp_finalize_sale_required r on r.sku_id = s.id
  for update;

  select s.sku, s.stock_current, r.quantity_required
    into v_fail_sku, v_fail_stock, v_fail_required
  from public.product_skus s
  join pg_temp.tmp_finalize_sale_required r on r.sku_id = s.id
  where s.stock_current < r.quantity_required
  limit 1;

  if v_fail_sku is not null then
    raise exception
      'Estoque insuficiente para SKU % (atual %, solicitado %)',
      v_fail_sku, v_fail_stock, v_fail_required;
  end if;

  create temporary table if not exists pg_temp.tmp_finalize_sale_payments (
    payment_method_id uuid,
    card_brand_id uuid,
    amount numeric(12,2),
    installments int,
    authorization_code text,
    notes text
  ) on commit drop;
  truncate table pg_temp.tmp_finalize_sale_payments;

  insert into pg_temp.tmp_finalize_sale_payments (
    payment_method_id,
    card_brand_id,
    amount,
    installments,
    authorization_code,
    notes
  )
  select
    nullif(trim(coalesce(elem ->> 'payment_method_id', '')), '')::uuid,
    nullif(trim(coalesce(elem ->> 'card_brand_id', '')), '')::uuid,
    coalesce(nullif(trim(coalesce(elem ->> 'amount', '')), '')::numeric, 0),
    coalesce(nullif(trim(coalesce(elem ->> 'installments', '')), '')::int, 1),
    nullif(trim(coalesce(elem ->> 'authorization_code', '')), ''),
    nullif(trim(coalesce(elem ->> 'notes', '')), '')
  from jsonb_array_elements(v_payments) elem;

  if exists (
    select 1
    from pg_temp.tmp_finalize_sale_payments
    where payment_method_id is null
      or amount <= 0
      or installments <= 0
  ) then
    raise exception 'Payload invalido: payments com metodo/valor/parcelas inconsistentes';
  end if;

  select p.payment_method_id::text into v_missing_method
  from pg_temp.tmp_finalize_sale_payments p
  left join public.payment_methods pm
    on pm.id = p.payment_method_id
   and pm.active = true
  where pm.id is null
  limit 1;

  if v_missing_method is not null then
    raise exception 'Metodo de pagamento nao encontrado/inativo: %', v_missing_method;
  end if;

  if exists (
    select 1
    from pg_temp.tmp_finalize_sale_payments p
    join public.payment_methods pm on pm.id = p.payment_method_id
    where pm.type in ('CARD_CREDIT','CARD_DEBIT')
      and p.card_brand_id is null
  ) then
    raise exception 'Bandeira obrigatoria para pagamentos de cartao';
  end if;

  select p.card_brand_id::text into v_missing_brand
  from pg_temp.tmp_finalize_sale_payments p
  left join public.card_brands cb
    on cb.id = p.card_brand_id
   and cb.active = true
  where p.card_brand_id is not null
    and cb.id is null
  limit 1;

  if v_missing_brand is not null then
    raise exception 'Bandeira nao encontrada/inativa: %', v_missing_brand;
  end if;

  select
    coalesce(sum(quantity * unit_price), 0),
    coalesce(sum(discount_amount), 0),
    count(*)
  into
    v_subtotal,
    v_items_discount_total,
    v_item_count
  from pg_temp.tmp_finalize_sale_items;

  v_discount_total := coalesce(nullif(trim(coalesce(payload ->> 'discount_total', '')), '')::numeric, 0);
  v_surcharge_total := coalesce(nullif(trim(coalesce(payload ->> 'surcharge_total', '')), '')::numeric, 0);
  v_total := round(v_subtotal - v_items_discount_total - v_discount_total + v_surcharge_total, 2);

  if v_total < 0 then
    raise exception 'Total da venda invalido';
  end if;

  select coalesce(sum(amount), 0), count(*)
    into v_paid_total, v_payment_count
  from pg_temp.tmp_finalize_sale_payments;

  v_paid_total := round(v_paid_total, 2);

  if v_paid_total < v_total then
    raise exception 'Valor pago insuficiente (total %, pago %)', v_total, v_paid_total;
  end if;

  v_change_total := round(greatest(v_paid_total - v_total, 0), 2);

  insert into public.sales (
    status,
    subtotal,
    items_discount_total,
    discount_total,
    surcharge_total,
    total,
    paid_total,
    change_total,
    notes,
    created_by
  )
  values (
    'COMPLETED',
    v_subtotal,
    v_items_discount_total,
    v_discount_total,
    v_surcharge_total,
    v_total,
    v_paid_total,
    v_change_total,
    nullif(trim(coalesce(payload ->> 'notes', '')), ''),
    v_user_id
  )
  returning id, number
    into v_sale_id, v_sale_number;

  insert into public.sale_items (
    sale_id,
    sku_id,
    quantity,
    unit_price,
    discount_amount,
    total_amount
  )
  select
    v_sale_id,
    sku_id,
    quantity,
    unit_price,
    discount_amount,
    round((quantity * unit_price) - discount_amount, 2)
  from pg_temp.tmp_finalize_sale_items;

  insert into public.sale_payments (
    sale_id,
    payment_method_id,
    card_brand_id,
    amount,
    installments,
    authorization_code,
    notes
  )
  select
    v_sale_id,
    payment_method_id,
    card_brand_id,
    amount,
    installments,
    authorization_code,
    notes
  from pg_temp.tmp_finalize_sale_payments;

  insert into public.stock_movements (
    sku_id,
    type,
    quantity,
    signed_quantity,
    reason,
    notes,
    source_type,
    source_id
  )
  select
    sku_id,
    'SAIDA',
    quantity_required,
    -quantity_required,
    'VENDA #' || v_sale_number,
    nullif(trim(coalesce(payload ->> 'notes', '')), ''),
    'SALE',
    v_sale_id
  from pg_temp.tmp_finalize_sale_required;

  return jsonb_build_object(
    'sale_id', v_sale_id,
    'number', v_sale_number,
    'subtotal', v_subtotal,
    'items_discount_total', v_items_discount_total,
    'discount_total', v_discount_total,
    'surcharge_total', v_surcharge_total,
    'total', v_total,
    'paid_total', v_paid_total,
    'change_total', v_change_total,
    'item_count', v_item_count,
    'payment_count', v_payment_count
  );
end;
$$;

revoke all on function public.finalize_sale(jsonb) from public;
grant execute on function public.finalize_sale(jsonb) to authenticated;
grant execute on function public.finalize_sale(jsonb) to service_role;
