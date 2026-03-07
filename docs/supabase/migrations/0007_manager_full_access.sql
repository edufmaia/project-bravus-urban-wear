-- 0007_manager_full_access.sql
-- Eleva GERENTE ao mesmo nivel de acesso de ADMIN nos modulos de catalogo e vendas.

-- Atualiza a view para expor custo/margem para ADMIN e GERENTE.
drop view if exists public.stock_overview;
create view public.stock_overview as
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
  case when public.user_role() in ('ADMIN', 'GERENTE') then s.cost else null end as cost,
  s.price,
  case
    when public.user_role() in ('ADMIN', 'GERENTE') and s.price is not null and s.price > 0
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

-- Catalogo: GERENTE passa a ter CRUD total em products e product_skus.
drop policy if exists "write_products" on public.products;
create policy "write_products" on public.products
  for all using (public.user_role() in ('ADMIN', 'GERENTE'))
  with check (public.user_role() in ('ADMIN', 'GERENTE'));

drop policy if exists "write_product_skus" on public.product_skus;
create policy "write_product_skus" on public.product_skus
  for all using (public.user_role() in ('ADMIN', 'GERENTE'))
  with check (public.user_role() in ('ADMIN', 'GERENTE'));

-- Vendas: GERENTE tambem pode deletar (mesmo nivel de ADMIN).
drop policy if exists "delete_sales" on public.sales;
create policy "delete_sales" on public.sales
  for delete using (public.user_role() in ('ADMIN', 'GERENTE'));

drop policy if exists "delete_sale_items" on public.sale_items;
create policy "delete_sale_items" on public.sale_items
  for delete using (public.user_role() in ('ADMIN', 'GERENTE'));

drop policy if exists "delete_sale_payments" on public.sale_payments;
create policy "delete_sale_payments" on public.sale_payments
  for delete using (public.user_role() in ('ADMIN', 'GERENTE'));
