# Setup Oficial - Bravus Urban Wear

## Fonte da verdade do banco
- Base inicial: `docs/supabase/schema.sql`
- Evoluções: `docs/supabase/migrations/*.sql` (ordem numérica)

O arquivo legado `docs/supabase.sql` foi descontinuado e arquivado.

## 1) Pré-requisitos
- Projeto no Supabase Cloud criado
- Auth por email/senha habilitado
- Node.js LTS instalado

## 2) Aplicar schema e migrations
No SQL Editor do Supabase, execute:

1. `docs/supabase/schema.sql`
2. `docs/supabase/migrations/0002_products_code_stock_view.sql`
3. `docs/supabase/migrations/0003_handle_new_user_profile_metadata.sql`
4. `docs/supabase/migrations/0004_normalize_stock_overview_and_policies.sql`
5. `docs/supabase/migrations/0005_sales_pos_module.sql`
6. `docs/supabase/migrations/0006_label_print_jobs.sql`
7. `docs/supabase/migrations/0007_manager_full_access.sql`

Importante:
- Sempre aplique `schema.sql` primeiro.
- Depois, aplique migrations em ordem crescente (`000x`).

## 2.1) Reset local DEV (zerar drift)
No Windows PowerShell, rode em dry-run:

```powershell
./scripts/db_reset_dev.ps1
```

Para executar o reset de fato (destrutivo para dados locais):

```powershell
./scripts/db_reset_dev.ps1 -Execute
```

O script:
- para os servicos locais (Supabase CLI ou docker compose),
- remove dados/volumes locais,
- sobe novamente,
- aplica `schema.sql` + migrations em ordem,
- executa queries de validacao (view, RLS/policies, funcoes e triggers).

## 3) Storage de imagens
- Crie o bucket privado `product-images`.
- Políticas recomendadas em `docs/supabase/rls.md`.

## 4) Configurar frontend
Crie `web/.env`:

```bash
VITE_SUPABASE_URL=SEU_URL
VITE_SUPABASE_ANON_KEY=SUA_ANON_KEY
```

## 5) Subir a aplicação

```bash
cd web
npm install
npm run dev
```

## 6) Validação rápida
- Cadastre o primeiro usuário: ele deve receber role `ADMIN` via trigger.
- Cadastre outro usuário: deve receber `VISUALIZADOR`.
- Verifique cadastro e perfil em `users_profile`.

## 7) Verificação de drift (opcional)
No SQL Editor, valide se objetos esperados existem:

```sql
select to_regclass('public.app_settings') as app_settings_table;

select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'stock_overview'
  and column_name in ('collection', 'margin');
```

## 8) Seed minimo de PDV (opcional)
Para popular ambiente de teste com produtos, SKUs, metodos e estoque:

1. Execute `docs/supabase/seeds/0001_minimal_pos_seed.sql`.
2. Valide no banco:
   - 2 produtos
   - 3 SKUs
   - 2 metodos de pagamento
   - 2 bandeiras
   - movimentacoes de entrada com `reason = 'SEED_INITIAL_STOCK'`
