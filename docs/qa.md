# QA Checklist

## Ambiente
- [ ] Node.js LTS instalado (`node -v`)
- [ ] npm funcionando (`npm -v`)
- [ ] Git instalado (`git --version`)

## Supabase
- [ ] Projeto “bravus-urban-wear” criado no Supabase Cloud
- [ ] Auth email/senha habilitado
- [ ] Setup oficial aplicado (`docs/SETUP.md`)
- [ ] URL e anon key adicionados em `web/.env`

## Aplicação
- [ ] `npm install` executado em `web/`
- [ ] `npm run dev` inicia sem erros
- [ ] Login / Cadastro funcionando com Supabase
- [ ] Dashboard carrega KPIs e gráficos
- [ ] CRUD básico de fornecedores
- [ ] Produtos e SKUs listados
- [ ] Importação CSV cria fornecedores, produtos e SKUs
- [ ] Movimentações atualizam estoque via trigger
- [ ] Estoque exibe status correto (Fora/Crítico/Instável/Estável)
- [ ] Exportações CSV geradas
- [ ] RPC `finalize_sale` cria venda/itens/pagamentos e baixa estoque
- [ ] Tela de Etiquetas busca SKUs e permite quantidade por SKU
- [ ] Pre-visualizacao de etiquetas renderiza barcode Code128
- [ ] Rota `/labels/print` abre sem sidebar/topbar e chama `window.print()`
- [ ] Historico de impressao grava em `label_print_jobs` (quando migration aplicada)

## Deploy
- [ ] Build (`npm run build`) concluído
- [ ] Deploy em Vercel/Netlify configurado com variáveis de ambiente
