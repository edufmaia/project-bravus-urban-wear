# Test Plan - Bravus Urban Wear (Supabase)

## Pré-requisitos
- Projeto Supabase Cloud criado
- `docs/supabase/schema.sql` aplicado
- `docs/supabase/migrations/0002_products_code_stock_view.sql` aplicado
- `docs/supabase/migrations/0003_handle_new_user_profile_metadata.sql` aplicado
- `docs/supabase/migrations/0004_normalize_stock_overview_and_policies.sql` aplicado
- `docs/supabase/migrations/0005_sales_pos_module.sql` aplicado
- `docs/supabase/migrations/0006_label_print_jobs.sql` aplicado
- `docs/supabase/migrations/0007_manager_full_access.sql` aplicado
- Variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` configuradas

## 1) Seed do Admin (obrigatório)
1. Crie o primeiro usuário (via tela de cadastro do app ou **Authentication > Users**).
2. Esse usuário deve ser o **primeiro** criado no projeto.
3. Verifique em `users_profile` que:
   - `role = ADMIN`
   - `first_name`, `last_name` e `company` foram preenchidos quando enviados no signup.

## 2) Código único do produto
1. Crie um produto com code `BRV-001`.
2. Tente criar outro produto com o mesmo code e nome diferente.
   - Deve falhar.

## 3) Importação com ordem e overview
1. Importe um XLSX com sheets `suppliers`, `products`, `product_skus`, `stock_movements` na ordem correta.
2. Valide o overview antes de confirmar.
3. Confirme a importação e verifique contagens nas tabelas.
4. Tente trocar a ordem das sheets e valide que o import bloqueia.

## 4) Preço opcional
1. Crie SKU com preço vazio.
2. Verifique `product_skus.price` como NULL.
3. UI mostra badge “Sem preço de venda”.

## 5) Estoque e view
1. Verifique `public.stock_overview` com custo/margem (ADMIN ou GERENTE).
2. Faça login com VISUALIZADOR e confira custo/margem como NULL.

## 6) Permissões
1. Login com VISUALIZADOR e tente editar produto/SKU.
   - Deve ser bloqueado na UI e no banco.
2. Login com GERENTE e tente editar produto/SKU, fornecedor e excluir venda.
   - Deve ser permitido.
3. Login com OPERADOR e tente criar movimentação.
   - Deve ser permitido.

## 7) Imagens de produto (Storage)
1. Crie/edite um produto e envie uma imagem PNG/JPG/WEBP.
   - O upload deve ir para `product-images/products/<product_id>/main.<ext>`.
   - O campo `products.image_url` deve guardar apenas o PATH.
2. Liste os produtos e verifique que a imagem aparece via Signed URL.
3. Clique na imagem para abrir o zoom/lightbox.
4. Login com VISUALIZADOR e confirme que não é possível fazer upload.

## 8) Importação “Somente Produtos” (PT-BR)
1. Clique em **Baixar modelo XLSX** na aba Produtos.
2. Preencha a aba **Produtos** com as colunas:
   - Código do Produto, Nome do Produto, Descrição, Categoria, Status, Coleção, Fornecedor.
3. No modal de importação, selecione **Somente Produtos (PT-BR)** e envie o XLSX.
4. Verifique o preview com:
   - Total de itens, erros, duplicados e fornecedores não encontrados.
5. Confirme a importação e valide o resumo:
   - Inseridos, duplicados/ignorados e erros.
6. Exemplo de CSV (PT-BR) com separador `;` (Excel):
```
Código do Produto;Nome do Produto;Descrição;Categoria;Status;Coleção;Fornecedor
BRV-001;Camiseta Bravus;Malha premium;Camisetas;ATIVO;Verão 25;Fornecedor A
BRV-002;Jaqueta City;Couro sintético;Jaquetas;ATIVO;;Fornecedor B
```
7. Observação: o import aceita `;` ou `,` e remove BOM do arquivo.

## 9) PDV via RPC
1. Garanta que existam metodos de pagamento ativos e SKUs com estoque.
2. Execute `select public.finalize_sale('<payload>'::jsonb);`.
3. Valide que:
   - `sales`, `sale_items` e `sale_payments` foram criadas.
   - `stock_movements` recebeu registros `type = 'SAIDA'`, `source_type = 'SALE'`, `source_id = sales.id`.
   - `product_skus.stock_current` foi reduzido corretamente.
4. Teste erro de estoque insuficiente:
   - A funcao deve falhar sem gravar venda parcial.
