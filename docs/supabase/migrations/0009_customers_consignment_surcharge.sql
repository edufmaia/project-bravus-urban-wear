-- 0009_customers_consignment_surcharge.sql
-- Cadastro de clientes, pagamento consignado, data da venda, devolucao de produtos.

-- ===================================================================
-- 1. TABELA CUSTOMERS
-- ===================================================================
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  social_name text,
  phone text,
  city text,
  notes text,
  status text not null default 'ATIVO' check (status in ('ATIVO','INATIVO')),
  created_by uuid references auth.users(id),
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create trigger customers_updated_at
  before update on public.customers
  for each row execute procedure public.set_updated_at();

create index if not exists customers_full_name_idx on public.customers (full_name);
create index if not exists customers_phone_idx on public.customers (phone);

-- ===================================================================
-- 2. NOVAS COLUNAS EM SALES (customer_id, sale_date)
-- ===================================================================
alter table public.sales add column if not exists customer_id uuid references public.customers(id);
alter table public.sales add column if not exists sale_date date;

create index if not exists sales_customer_id_idx on public.sales (customer_id);
create index if not exists sales_sale_date_idx on public.sales (sale_date);

-- ===================================================================
-- 3. CONSIGNADO: AMPLIAR CHECK EM payment_methods E NOVAS COLUNAS EM sale_payments
-- ===================================================================
DO $$ DECLARE _name text;
BEGIN
  SELECT con.conname INTO _name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE rel.relname = 'payment_methods'
    AND nsp.nspname = 'public'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%type%';
  IF _name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.payment_methods DROP CONSTRAINT %I', _name);
  END IF;
END $$;

alter table public.payment_methods add constraint payment_methods_type_check
  check (type in ('CASH','CARD_CREDIT','CARD_DEBIT','PIX','OTHER','CONSIGNADO'));

alter table public.sale_payments add column if not exists due_date date;
alter table public.sale_payments add column if not exists payment_status text not null default 'PAID'
  check (payment_status in ('PAID','PENDING'));
alter table public.sale_payments add column if not exists paid_at timestamp;

create index if not exists sale_payments_status_idx on public.sale_payments (payment_status);
create index if not exists sale_payments_due_date_idx on public.sale_payments (due_date);

-- Seed: metodo de pagamento CONSIGNADO
insert into public.payment_methods (code, name, type, active)
values ('CONSIGNADO', 'Consignado', 'CONSIGNADO', true)
on conflict (code) do update
  set name = excluded.name, type = excluded.type, active = excluded.active, updated_at = now();

-- ===================================================================
-- 4. TABELAS DE DEVOLUCAO
-- ===================================================================
create table if not exists public.sale_returns (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id),
  reason text,
  notes text,
  total_amount numeric(12,2) not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamp default now()
);

create table if not exists public.sale_return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.sale_returns(id) on delete cascade,
  sale_item_id uuid not null references public.sale_items(id),
  sku_id uuid not null references public.product_skus(id),
  quantity int not null check (quantity > 0),
  unit_price numeric(12,2) not null,
  total_amount numeric(12,2) not null,
  created_at timestamp default now()
);

create index if not exists sale_returns_sale_id_idx on public.sale_returns (sale_id);
create index if not exists sale_return_items_return_id_idx on public.sale_return_items (return_id);
create index if not exists sale_return_items_sku_id_idx on public.sale_return_items (sku_id);

-- ===================================================================
-- 5. RLS POLICIES
-- ===================================================================

-- Customers
alter table public.customers enable row level security;

drop policy if exists "read_all_customers" on public.customers;
create policy "read_all_customers" on public.customers
  for select using (auth.role() = 'authenticated');

drop policy if exists "insert_customers" on public.customers;
create policy "insert_customers" on public.customers
  for insert with check (public.user_role() in ('ADMIN','GERENTE','OPERADOR'));

drop policy if exists "update_customers" on public.customers;
create policy "update_customers" on public.customers
  for update using (public.user_role() in ('ADMIN','GERENTE','OPERADOR'))
  with check (public.user_role() in ('ADMIN','GERENTE','OPERADOR'));

drop policy if exists "delete_customers" on public.customers;
create policy "delete_customers" on public.customers
  for delete using (public.user_role() in ('ADMIN','GERENTE'));

-- Sale Returns
alter table public.sale_returns enable row level security;

drop policy if exists "read_all_sale_returns" on public.sale_returns;
create policy "read_all_sale_returns" on public.sale_returns
  for select using (auth.role() = 'authenticated');

drop policy if exists "insert_sale_returns" on public.sale_returns;
create policy "insert_sale_returns" on public.sale_returns
  for insert with check (public.user_role() in ('ADMIN','GERENTE','OPERADOR'));

drop policy if exists "update_sale_returns" on public.sale_returns;
create policy "update_sale_returns" on public.sale_returns
  for update using (public.user_role() in ('ADMIN','GERENTE'))
  with check (public.user_role() in ('ADMIN','GERENTE'));

drop policy if exists "delete_sale_returns" on public.sale_returns;
create policy "delete_sale_returns" on public.sale_returns
  for delete using (public.user_role() in ('ADMIN','GERENTE'));

-- Sale Return Items
alter table public.sale_return_items enable row level security;

drop policy if exists "read_all_sale_return_items" on public.sale_return_items;
create policy "read_all_sale_return_items" on public.sale_return_items
  for select using (auth.role() = 'authenticated');

drop policy if exists "insert_sale_return_items" on public.sale_return_items;
create policy "insert_sale_return_items" on public.sale_return_items
  for insert with check (public.user_role() in ('ADMIN','GERENTE','OPERADOR'));

drop policy if exists "update_sale_return_items" on public.sale_return_items;
create policy "update_sale_return_items" on public.sale_return_items
  for update using (public.user_role() in ('ADMIN','GERENTE'))
  with check (public.user_role() in ('ADMIN','GERENTE'));

drop policy if exists "delete_sale_return_items" on public.sale_return_items;
create policy "delete_sale_return_items" on public.sale_return_items
  for delete using (public.user_role() in ('ADMIN','GERENTE'));

-- ===================================================================
-- 6. RPC finalize_sale() — ATUALIZADO (customer_id, sale_date, consignado)
-- ===================================================================
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
  v_customer_id uuid;
  v_sale_date date;
  v_has_consignment boolean := false;
begin
  -- Autenticacao
  if v_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  select role into v_role
  from public.users_profile
  where id = v_user_id;

  if v_role not in ('ADMIN','GERENTE','OPERADOR') then
    raise exception 'Perfil sem permissao para finalizar venda';
  end if;

  -- Parse customer_id e sale_date
  v_customer_id := nullif(trim(coalesce(payload ->> 'customer_id', '')), '')::uuid;
  v_sale_date := coalesce(
    nullif(trim(coalesce(payload ->> 'sale_date', '')), '')::date,
    current_date
  );

  -- Validar customer se fornecido
  if v_customer_id is not null then
    if not exists (select 1 from public.customers where id = v_customer_id) then
      raise exception 'Cliente nao encontrado: %', v_customer_id;
    end if;
  end if;

  -- Validar payload
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'Payload invalido: items obrigatorio';
  end if;

  if jsonb_typeof(v_payments) <> 'array' or jsonb_array_length(v_payments) = 0 then
    raise exception 'Payload invalido: payments obrigatorio';
  end if;

  -- === ITEMS ===
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

  -- Agregar quantidades por SKU
  create temporary table if not exists pg_temp.tmp_finalize_sale_required (
    sku_id uuid primary key,
    quantity_required int not null
  ) on commit drop;
  truncate table pg_temp.tmp_finalize_sale_required;

  insert into pg_temp.tmp_finalize_sale_required (sku_id, quantity_required)
  select sku_id, sum(quantity)
  from pg_temp.tmp_finalize_sale_items
  group by sku_id;

  -- Verificar SKUs existem
  select r.sku_id::text into v_missing_sku
  from pg_temp.tmp_finalize_sale_required r
  left join public.product_skus s on s.id = r.sku_id
  where s.id is null
  limit 1;

  if v_missing_sku is not null then
    raise exception 'SKU nao encontrado: %', v_missing_sku;
  end if;

  -- Lock SKUs e verificar estoque
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

  -- === PAYMENTS ===
  create temporary table if not exists pg_temp.tmp_finalize_sale_payments (
    payment_method_id uuid,
    card_brand_id uuid,
    amount numeric(12,2),
    installments int,
    authorization_code text,
    notes text,
    due_date date
  ) on commit drop;
  truncate table pg_temp.tmp_finalize_sale_payments;

  insert into pg_temp.tmp_finalize_sale_payments (
    payment_method_id, card_brand_id, amount, installments,
    authorization_code, notes, due_date
  )
  select
    nullif(trim(coalesce(elem ->> 'payment_method_id', '')), '')::uuid,
    nullif(trim(coalesce(elem ->> 'card_brand_id', '')), '')::uuid,
    coalesce(nullif(trim(coalesce(elem ->> 'amount', '')), '')::numeric, 0),
    coalesce(nullif(trim(coalesce(elem ->> 'installments', '')), '')::int, 1),
    nullif(trim(coalesce(elem ->> 'authorization_code', '')), ''),
    nullif(trim(coalesce(elem ->> 'notes', '')), ''),
    nullif(trim(coalesce(elem ->> 'due_date', '')), '')::date
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

  -- Verificar metodos existem e ativos
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

  -- Cartao exige bandeira
  if exists (
    select 1
    from pg_temp.tmp_finalize_sale_payments p
    join public.payment_methods pm on pm.id = p.payment_method_id
    where pm.type in ('CARD_CREDIT','CARD_DEBIT')
      and p.card_brand_id is null
  ) then
    raise exception 'Bandeira obrigatoria para pagamentos de cartao';
  end if;

  -- Verificar bandeiras existem e ativas
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

  -- Verificar se ha consignado e exigir customer_id
  select exists(
    select 1
    from pg_temp.tmp_finalize_sale_payments p
    join public.payment_methods pm on pm.id = p.payment_method_id
    where pm.type = 'CONSIGNADO'
  ) into v_has_consignment;

  if v_has_consignment and v_customer_id is null then
    raise exception 'Pagamento consignado exige que um cliente seja informado (customer_id)';
  end if;

  -- === CALCULOS FINANCEIROS ===
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

  -- === INSERTS ===

  -- Sale
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
    created_by,
    customer_id,
    sale_date
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
    v_user_id,
    v_customer_id,
    v_sale_date
  )
  returning id, number
    into v_sale_id, v_sale_number;

  -- Sale Items
  insert into public.sale_items (
    sale_id, sku_id, quantity, unit_price, discount_amount, total_amount
  )
  select
    v_sale_id,
    sku_id,
    quantity,
    unit_price,
    discount_amount,
    round((quantity * unit_price) - discount_amount, 2)
  from pg_temp.tmp_finalize_sale_items;

  -- Sale Payments (com due_date e payment_status)
  insert into public.sale_payments (
    sale_id, payment_method_id, card_brand_id, amount,
    installments, authorization_code, notes, due_date, payment_status
  )
  select
    v_sale_id,
    p.payment_method_id,
    p.card_brand_id,
    p.amount,
    p.installments,
    p.authorization_code,
    p.notes,
    p.due_date,
    case when pm.type = 'CONSIGNADO' then 'PENDING' else 'PAID' end
  from pg_temp.tmp_finalize_sale_payments p
  join public.payment_methods pm on pm.id = p.payment_method_id;

  -- Stock Movements
  insert into public.stock_movements (
    sku_id, type, quantity, signed_quantity, reason, notes, source_type, source_id
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
    'payment_count', v_payment_count,
    'customer_id', v_customer_id,
    'sale_date', v_sale_date
  );
end;
$$;

revoke all on function public.finalize_sale(jsonb) from public;
grant execute on function public.finalize_sale(jsonb) to authenticated;
grant execute on function public.finalize_sale(jsonb) to service_role;

-- ===================================================================
-- 7. RPC mark_consignment_paid(payload jsonb)
-- ===================================================================
create or replace function public.mark_consignment_paid(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_payment_id uuid;
  v_current_status text;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  select role into v_role from public.users_profile where id = v_user_id;
  if v_role not in ('ADMIN','GERENTE','OPERADOR') then
    raise exception 'Perfil sem permissao';
  end if;

  v_payment_id := (payload ->> 'sale_payment_id')::uuid;
  if v_payment_id is null then
    raise exception 'sale_payment_id obrigatorio';
  end if;

  select payment_status into v_current_status
  from public.sale_payments
  where id = v_payment_id
  for update;

  if v_current_status is null then
    raise exception 'Pagamento nao encontrado';
  end if;

  if v_current_status = 'PAID' then
    raise exception 'Pagamento ja esta quitado';
  end if;

  update public.sale_payments
  set payment_status = 'PAID',
      paid_at = now()
  where id = v_payment_id;

  return jsonb_build_object(
    'sale_payment_id', v_payment_id,
    'status', 'PAID',
    'paid_at', now()
  );
end;
$$;

revoke all on function public.mark_consignment_paid(jsonb) from public;
grant execute on function public.mark_consignment_paid(jsonb) to authenticated;
grant execute on function public.mark_consignment_paid(jsonb) to service_role;

-- ===================================================================
-- 8. RPC process_sale_return(payload jsonb)
-- ===================================================================
create or replace function public.process_sale_return(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_sale_id uuid;
  v_sale_number bigint;
  v_return_id uuid;
  v_return_total numeric(12,2) := 0;
  v_items jsonb := coalesce(payload -> 'items', '[]'::jsonb);
  v_reason text;
  v_notes text;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  select role into v_role from public.users_profile where id = v_user_id;
  if v_role not in ('ADMIN','GERENTE','OPERADOR') then
    raise exception 'Perfil sem permissao para devolver itens';
  end if;

  v_sale_id := (payload ->> 'sale_id')::uuid;
  v_reason := nullif(trim(coalesce(payload ->> 'reason', '')), '');
  v_notes := nullif(trim(coalesce(payload ->> 'notes', '')), '');

  if v_sale_id is null then
    raise exception 'sale_id obrigatorio';
  end if;

  select number into v_sale_number from public.sales where id = v_sale_id;
  if v_sale_number is null then
    raise exception 'Venda nao encontrada';
  end if;

  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'items obrigatorio para devolucao';
  end if;

  -- Criar header da devolucao
  insert into public.sale_returns (sale_id, reason, notes, created_by)
  values (v_sale_id, v_reason, v_notes, v_user_id)
  returning id into v_return_id;

  -- Temp table para itens de devolucao
  create temporary table if not exists pg_temp.tmp_return_items (
    sale_item_id uuid,
    sku_id uuid,
    quantity int,
    unit_price numeric(12,2)
  ) on commit drop;
  truncate table pg_temp.tmp_return_items;

  insert into pg_temp.tmp_return_items (sale_item_id, sku_id, quantity, unit_price)
  select
    (elem ->> 'sale_item_id')::uuid,
    (elem ->> 'sku_id')::uuid,
    coalesce((elem ->> 'quantity')::int, 0),
    coalesce((elem ->> 'unit_price')::numeric, 0)
  from jsonb_array_elements(v_items) elem;

  -- Validar itens
  if exists (
    select 1 from pg_temp.tmp_return_items
    where quantity <= 0 or sku_id is null or sale_item_id is null
  ) then
    raise exception 'Itens de devolucao invalidos';
  end if;

  -- Inserir itens da devolucao
  insert into public.sale_return_items (
    return_id, sale_item_id, sku_id, quantity, unit_price, total_amount
  )
  select
    v_return_id,
    sale_item_id,
    sku_id,
    quantity,
    unit_price,
    round(quantity * unit_price, 2)
  from pg_temp.tmp_return_items;

  -- Calcular total da devolucao
  select coalesce(sum(round(quantity * unit_price, 2)), 0)
  into v_return_total
  from pg_temp.tmp_return_items;

  update public.sale_returns set total_amount = v_return_total where id = v_return_id;

  -- Criar movimentacoes de estoque ENTRADA (reverso da SAIDA original)
  insert into public.stock_movements (
    sku_id, type, quantity, signed_quantity, reason, notes, source_type, source_id
  )
  select
    r.sku_id,
    'ENTRADA',
    r.quantity,
    r.quantity,
    'DEVOLUCAO VENDA #' || v_sale_number,
    v_notes,
    'RETURN',
    v_return_id
  from (
    select sku_id, sum(quantity) as quantity
    from pg_temp.tmp_return_items
    group by sku_id
  ) r;

  return jsonb_build_object(
    'return_id', v_return_id,
    'sale_id', v_sale_id,
    'total_amount', v_return_total
  );
end;
$$;

revoke all on function public.process_sale_return(jsonb) from public;
grant execute on function public.process_sale_return(jsonb) to authenticated;
grant execute on function public.process_sale_return(jsonb) to service_role;
