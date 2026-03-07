# Bravus Urban Wear

Sistema web para controle de estoque e movimentações de uma marca streetwear.

## Requisitos
- Node.js LTS
- Git
- Conta no Supabase Cloud

## Instalação
```bash
cd web
npm install
```

## Configuração do Supabase
1. Crie o projeto **bravus-urban-wear** no Supabase Cloud.
2. Ative Auth com email/senha.
3. Siga o setup oficial em `docs/SETUP.md` (schema + migrations).
4. Crie `web/.env` com:
```bash
VITE_SUPABASE_URL=SEU_URL
VITE_SUPABASE_ANON_KEY=SUA_ANON_KEY
```

## Rodar localmente
```bash
cd web
npm run dev
```

## Build
```bash
cd web
npm run build
```

## Deploy (Vercel/Netlify)
- Faça deploy da pasta `web`.
- Configure as variáveis de ambiente `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.

## Documentação
- `docs/SETUP.md`
- `docs/assumptions.md`
- `docs/qa.md`
- `docs/template-import.csv`
- `docs/supabase/schema.sql`
- `docs/supabase/migrations/`
- `docs/supabase/pdv-rpc.md`
- `docs/supabase/seeds/`
