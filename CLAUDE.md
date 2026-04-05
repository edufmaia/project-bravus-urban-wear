# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Bravus Urban Wear** — single-tenant web app for inventory management and POS (Point of Sale) for a streetwear brand. All source code lives in `web/`.

## Commands

All commands run from the `web/` directory:

```bash
npm install       # Install dependencies
npm run dev       # Start Vite dev server
npm run build     # TypeScript check + production build (output: dist/)
npm run lint      # ESLint validation
npm run preview   # Preview production build locally
```

Database reset (PowerShell, project root):
```powershell
./scripts/db_reset_dev.ps1
```

## Environment Setup

Create `web/.env`:
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

Database schema must be applied manually via the Supabase SQL editor following `docs/SETUP.md`: schema.sql first, then migrations in order, then optionally seeds.

## Architecture

**Stack:** React 19 + TypeScript + Vite + Tailwind CSS + Supabase (PostgreSQL, Auth, RLS, RPC)

There is no custom backend — Supabase serves as the entire backend via REST API, Row-Level Security, triggers, and RPC functions.

### State Management

Two React Contexts wrap the entire app (`web/src/main.tsx`):

1. **`AuthContext`** (`lib/auth.tsx`) — Supabase session + user profile with role (`ADMIN`, `GERENTE`, `OPERADOR`, `VISUALIZADOR`). The first registered user automatically becomes `ADMIN` via a DB trigger.

2. **`PdvCartContext`** (`lib/pdvCart.tsx`) — POS cart state, persisted to `localStorage` under key `bravus-urban-wear-pdv-cart-v1`. Cart is not synced to the backend until checkout.

### Routing & Access Control

`App.tsx` defines all routes. `ProtectedRoute` enforces auth and optional role requirements. Public routes: `/login`, `/cadastro`, `/recuperar-senha`, `/redefinir-senha`. All other routes require authentication; PDV/sales/labels require `ADMIN`, `GERENTE`, or `OPERADOR`.

### Supabase Integration

- Client initialized in `lib/supabaseClient.ts`
- Business logic enforced server-side:
  - Negative stock is **prevented by a DB trigger** — do not try to handle it client-side
  - `finalize_sale()` RPC handles the entire checkout atomically (sale header + items + payments + stock deduction)
  - Role assignment is automatic: first user → ADMIN, others → VISUALIZADOR
- Images stored in the `product-images` private bucket via `lib/storage.ts`
- `stock_overview` view masks `cost` and `margin` columns to `NULL` for `OPERADOR`/`VISUALIZADOR` roles (enforced via `security_invoker` + `user_role()`)
- `prevent_role_escalation()` DB trigger blocks unauthorized role changes on `users_profile`

### Key Files

| File | Purpose |
|------|---------|
| `src/lib/auth.tsx` | Auth context, role checks, `useAuth()` hook |
| `src/lib/pdvCart.tsx` | POS cart context |
| `src/lib/csv.ts` | CSV import/export (processed entirely in frontend) |
| `src/lib/labels.ts` | Barcode label generation (Code128 via jsbarcode) |
| `src/lib/utils.ts` | Currency/date formatters, validators |
| `src/pages/Products.tsx` | Largest page (~1886 lines) — product + SKU CRUD with bulk CSV import |
| `docs/supabase/schema.sql` | Full DB schema (reference for table structure) |
| `docs/supabase/migrations/` | 8 sequential migrations applied after schema |
| `docs/supabase/pdv-rpc.md` | `finalize_sale()` RPC documentation |
| `docs/assumptions.md` | Business logic assumptions |
| `docs/supabase/rls.md` | RLS policies per table and role |
| `docs/qa.md` | QA test scenarios |
| `docs/template-import.csv` | Reference CSV format for bulk product import |

### Data Model

Core entities and their relationships:
- `suppliers` → `products` → `product_skus` (one product has many SKUs by color/size)
- `stock_movements` audit trail triggers updates to `stock_overview` materialized view
- `sales` → `sale_items` → `product_skus`
- `users_profile` stores role and display name linked to `auth.users`

### UI Conventions

- Tailwind custom theme defined in `tailwind.config.js` with named colors: `ink`, `shell`, `lime`, `ember`, `slate`, `steel`
- Tailwind font families: `font-display` (Bebas Neue/Oswald — headings) and `font-body` (Inter Tight — body text)
- Reusable UI primitives in `src/components/ui/` (Button, Card, Input, Badge, Modal)
- Use `cn()` from `lib/utils.ts` (wraps `clsx`) for conditional class merging
- Layout: `AppShell` wraps all protected pages with `Sidebar` + `Topbar`
- Portuguese (Brazilian) is the UI language throughout
- Icons: `lucide-react`; charts: `recharts`; validation: `zod`

### Pages

| Route | Page | Role restriction |
|-------|------|-----------------|
| `/dashboard` | Dashboard | All authenticated |
| `/produtos` | Products | All authenticated |
| `/estoque` | Stock | All authenticated |
| `/movimentacoes` | Movements | All authenticated |
| `/fornecedores` | Suppliers | All authenticated |
| `/usuarios` | Users | All authenticated |
| `/sistema` | System | All authenticated (stub — not yet implemented) |
| `/pdv` | PDV (POS) | ADMIN, GERENTE, OPERADOR |
| `/checkout` | Checkout | ADMIN, GERENTE, OPERADOR |
| `/vendas` | Sales | ADMIN, GERENTE, OPERADOR |
| `/labels` | Labels | ADMIN, GERENTE, OPERADOR |

## Deployment

Deploy the `web/` folder to Vercel or Netlify. The `vercel.json` rewrites all paths to `/index.html` for SPA routing. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables in the platform.
