-- 0001_minimal_pos_seed.sql
-- Seed minimo para PDV:
-- - 2 produtos
-- - 3 SKUs
-- - 2 metodos de pagamento
-- - 2 bandeiras
-- - estoque inicial via stock_movements

-- Metodos de pagamento
insert into public.payment_methods (code, name, type, active)
values
  ('CASH', 'Dinheiro', 'CASH', true),
  ('CARD_CREDIT', 'Cartao de Credito', 'CARD_CREDIT', true)
on conflict (code) do update
set
  name = excluded.name,
  type = excluded.type,
  active = excluded.active,
  updated_at = now();

-- Bandeiras
insert into public.card_brands (code, name, active)
values
  ('VISA', 'Visa', true),
  ('MASTERCARD', 'Mastercard', true)
on conflict (code) do update
set
  name = excluded.name,
  active = excluded.active,
  updated_at = now();

-- Fornecedor base
insert into public.suppliers (name, email, phone, status)
select 'Seed Supplier', 'seed@supplier.local', '+55 11 99999-0000', 'ATIVO'
where not exists (
  select 1 from public.suppliers where name = 'Seed Supplier'
);

-- Produtos base
with sup as (
  select id
  from public.suppliers
  where name = 'Seed Supplier'
  limit 1
)
insert into public.products (code, name, description, category, collection, supplier_id, status, image_url)
select
  'TSH-001',
  'Camiseta Street Basic',
  'Camiseta algodao streetwear',
  'Camisetas',
  'Core',
  (select id from sup),
  'ATIVO',
  null
where not exists (
  select 1 from public.products where code = 'TSH-001'
);

with sup as (
  select id
  from public.suppliers
  where name = 'Seed Supplier'
  limit 1
)
insert into public.products (code, name, description, category, collection, supplier_id, status, image_url)
select
  'HOD-001',
  'Moletom Bravus Heavy',
  'Moletom premium com capuz',
  'Moletons',
  'Core',
  (select id from sup),
  'ATIVO',
  null
where not exists (
  select 1 from public.products where code = 'HOD-001'
);

-- SKUs base (3)
with p as (
  select id from public.products where code = 'TSH-001' limit 1
)
insert into public.product_skus (product_id, sku, color, size, cost, price, stock_min, status)
select
  (select id from p),
  'TSH-001-BLK-M',
  'Preto',
  'M',
  39.90,
  99.90,
  5,
  'ATIVO'
where not exists (
  select 1 from public.product_skus where sku = 'TSH-001-BLK-M'
);

with p as (
  select id from public.products where code = 'TSH-001' limit 1
)
insert into public.product_skus (product_id, sku, color, size, cost, price, stock_min, status)
select
  (select id from p),
  'TSH-001-WHT-G',
  'Branco',
  'G',
  39.90,
  99.90,
  5,
  'ATIVO'
where not exists (
  select 1 from public.product_skus where sku = 'TSH-001-WHT-G'
);

with p as (
  select id from public.products where code = 'HOD-001' limit 1
)
insert into public.product_skus (product_id, sku, color, size, cost, price, stock_min, status)
select
  (select id from p),
  'HOD-001-GRY-M',
  'Cinza',
  'M',
  89.90,
  199.90,
  3,
  'ATIVO'
where not exists (
  select 1 from public.product_skus where sku = 'HOD-001-GRY-M'
);

-- Estoque inicial (usa trigger apply_stock_movement)
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
  s.id,
  'ENTRADA',
  30,
  30,
  'SEED_INITIAL_STOCK',
  'Carga inicial de estoque',
  'SEED',
  null
from public.product_skus s
where s.sku in ('TSH-001-BLK-M', 'TSH-001-WHT-G', 'HOD-001-GRY-M')
  and not exists (
    select 1
    from public.stock_movements m
    where m.sku_id = s.id
      and m.reason = 'SEED_INITIAL_STOCK'
  );
