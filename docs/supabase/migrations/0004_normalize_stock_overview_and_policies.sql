-- 0004_normalize_stock_overview_and_policies.sql
-- Normaliza ambientes que aplicaram versões antigas do 0002.

-- Products: garante colunas e constraint
alter table public.products add column if not exists code text;
alter table public.products add column if not exists image_url text;

update public.products
set code = coalesce(code, 'PRD-' || substring(id::text, 1, 8))
where code is null;

alter table public.products alter column code set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_code_key'
  ) then
    alter table public.products add constraint products_code_key unique (code);
  end if;
end $$;

-- SKU: preço opcional
alter table public.product_skus alter column price drop not null;
alter table public.product_skus alter column price drop default;

-- Recria view com shape atual
create or replace view public.stock_overview as
select
  s.id as sku_id,
  s.sku,
  p.id as product_id,
  p.name as product_name,
  p.code as product_code,
  sup.name as supplier_name,
  p.category,
  p.collection,
  (
    select max(occurred_at)
    from public.stock_movements m
    where m.sku_id = s.id and m.type = 'ENTRADA'
  ) as last_entry,
  (
    select max(occurred_at)
    from public.stock_movements m
    where m.sku_id = s.id and m.type = 'SAIDA'
  ) as last_exit,
  case when public.user_role() = 'ADMIN' then s.cost else null end as cost,
  s.price,
  case
    when public.user_role() = 'ADMIN' and s.price is not null and s.price > 0
      then round(((s.price - s.cost) / s.price) * 100, 2)
    else null
  end as margin,
  s.stock_current,
  s.stock_min,
  s.status
from public.product_skus s
join public.products p on p.id = s.product_id
left join public.suppliers sup on sup.id = p.supplier_id;

alter view public.stock_overview set (security_invoker = true);

-- Reaplica políticas de escrita esperadas
drop policy if exists "write_products" on public.products;
create policy "write_products" on public.products
  for all using (public.user_role() in ('ADMIN'))
  with check (public.user_role() in ('ADMIN'));

drop policy if exists "write_product_skus" on public.product_skus;
create policy "write_product_skus" on public.product_skus
  for all using (public.user_role() in ('ADMIN'))
  with check (public.user_role() in ('ADMIN'));

drop policy if exists "write_suppliers" on public.suppliers;
create policy "write_suppliers" on public.suppliers
  for all using (public.user_role() in ('ADMIN','GERENTE'))
  with check (public.user_role() in ('ADMIN','GERENTE'));

drop policy if exists "write_stock_movements" on public.stock_movements;
create policy "write_stock_movements" on public.stock_movements
  for all using (public.user_role() in ('ADMIN','GERENTE','OPERADOR'))
  with check (public.user_role() in ('ADMIN','GERENTE','OPERADOR'));
