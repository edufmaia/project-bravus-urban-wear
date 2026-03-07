# RLS - Bravus Urban Wear

## Objetivo
Garantir que apenas usuários autenticados leiam dados e que a escrita fique restrita conforme o role.

## Segurança adicional
- `public.handle_new_user()` é **SECURITY DEFINER** com `set search_path = public`.
- `public.app_settings` garante que apenas o primeiro usuário vira ADMIN.
- `public.prevent_role_escalation()` impede alteração indevida de roles.

## Políticas principais
- users_profile
  - SELECT: próprio usuário **ou** ADMIN/GERENTE
  - UPDATE: próprio usuário **ou** ADMIN/GERENTE (role protegido pelo trigger)
  - INSERT manual: apenas ADMIN/GERENTE
- suppliers
  - SELECT: qualquer usuário autenticado
  - INSERT/UPDATE/DELETE: ADMIN/GERENTE
- products
  - SELECT: qualquer usuário autenticado
  - INSERT/UPDATE/DELETE: ADMIN/GERENTE
- product_skus
  - SELECT: qualquer usuário autenticado
  - INSERT/UPDATE/DELETE: ADMIN/GERENTE
- stock_movements
  - SELECT: qualquer usuário autenticado
  - INSERT/UPDATE/DELETE: ADMIN/GERENTE/OPERADOR
- sales
  - SELECT: qualquer usuário autenticado
  - INSERT: ADMIN/GERENTE/OPERADOR
  - UPDATE/DELETE: ADMIN/GERENTE
- sale_items
  - SELECT: qualquer usuário autenticado
  - INSERT: ADMIN/GERENTE/OPERADOR
  - UPDATE/DELETE: ADMIN/GERENTE
- sale_payments
  - SELECT: qualquer usuário autenticado
  - INSERT: ADMIN/GERENTE/OPERADOR
  - UPDATE/DELETE: ADMIN/GERENTE
- payment_methods/card_brands
  - SELECT: qualquer usuário autenticado
  - INSERT/UPDATE/DELETE: ADMIN/GERENTE
- storage (bucket `product-images` privado)
  - READ: apenas via Signed URL para usuários autenticados
  - WRITE (upload/update/delete): ADMIN/GERENTE/OPERADOR

## View stock_overview
- `public.stock_overview` expõe visão de estoque.
- Custo e margem sao **NULL** para usuarios sem role ADMIN/GERENTE.
- A view utiliza `security_invoker` e `public.user_role()` para mascarar valores.

## Como aplicar
1. Execute `docs/supabase/schema.sql` no SQL Editor.
2. Execute `docs/supabase/migrations/0002_products_code_stock_view.sql`.
3. Execute `docs/supabase/migrations/0003_handle_new_user_profile_metadata.sql`.
4. Execute `docs/supabase/migrations/0004_normalize_stock_overview_and_policies.sql`.
5. Execute `docs/supabase/migrations/0005_sales_pos_module.sql`.
6. Execute `docs/supabase/migrations/0006_label_print_jobs.sql`.
7. Execute `docs/supabase/migrations/0007_manager_full_access.sql`.

Para ambiente novo, siga o fluxo oficial em `docs/SETUP.md`.

## Erros comuns
- "permission denied for relation": RLS ativa sem policy de INSERT.
- "jwt claim missing": usuário não autenticado.
