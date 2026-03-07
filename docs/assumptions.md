# Assumptions

- Single-tenant: o primeiro usuário cadastrado recebe role ADMIN e administra a empresa.
- Autenticação via Supabase Auth (email/senha) com confirmação por e-mail desativada ou liberada no painel.
- O status padrão de produtos, SKUs e fornecedores é ATIVO.
- Importação CSV é processada no frontend e executa inserts/updates sequenciais no Supabase.
- Não é permitido estoque negativo: o trigger impede saldo abaixo de zero.
- O dashboard usa dados reais quando disponíveis; caso contrário apresenta séries derivadas do estoque atual.
- A UI replica o layout das telas de referência, mantendo o branding “Bravus Urban Wear”.
- O CSV exportado inclui SKUs e campos básicos; descrições e fornecedores podem ser complementados manualmente.
