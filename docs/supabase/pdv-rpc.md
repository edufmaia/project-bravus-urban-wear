# PDV RPC - finalize_sale(payload jsonb)

## Objetivo
Fechar venda de forma atomica no banco:
- valida estoque
- cria venda, itens e pagamentos
- gera saida em `stock_movements` vinculada ao documento

## Funcao
- Nome: `public.finalize_sale(payload jsonb)`
- Retorno: `jsonb` com resumo da venda (`sale_id`, `number`, totais e contagens)

## Payload esperado

```json
{
  "items": [
    {
      "sku_id": "uuid-do-sku",
      "quantity": 2,
      "unit_price": 99.9,
      "discount_amount": 0
    }
  ],
  "payments": [
    {
      "payment_method_id": "uuid-do-metodo",
      "card_brand_id": "uuid-da-bandeira-opcional",
      "amount": 199.8,
      "installments": 1,
      "authorization_code": "ABC123",
      "notes": "Pagamento no caixa"
    }
  ],
  "discount_total": 0,
  "surcharge_total": 0,
  "notes": "Venda balcão"
}
```

## Regras principais
- Requer usuario autenticado e role `ADMIN`, `GERENTE` ou `OPERADOR`.
- Cada item deve ter `sku_id`, `quantity > 0` e preco valido.
- Estoque e validado antes da saida.
- Metodos de pagamento devem estar ativos.
- Pagamentos de cartao exigem bandeira.
- Soma dos pagamentos deve cobrir o total da venda.

## Exemplo de chamada (SQL)

```sql
select public.finalize_sale(
  '{
    "items": [{"sku_id":"00000000-0000-0000-0000-000000000000","quantity":1,"unit_price":99.9}],
    "payments": [{"payment_method_id":"00000000-0000-0000-0000-000000000000","amount":99.9}],
    "discount_total":0,
    "surcharge_total":0
  }'::jsonb
);
```
