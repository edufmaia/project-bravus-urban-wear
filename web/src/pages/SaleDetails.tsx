import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { supabase } from "../lib/supabaseClient";
import { formatCurrency, formatDate } from "../lib/utils";

type SaleDetail = {
  id: string;
  number: number;
  status: "OPEN" | "COMPLETED" | "CANCELED";
  subtotal: number;
  items_discount_total: number;
  discount_total: number;
  surcharge_total: number;
  total: number;
  paid_total: number;
  change_total: number;
  notes: string | null;
  created_at: string;
};

type SaleItemRow = {
  id: string;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  total_amount: number;
  product_skus: {
    sku: string;
    color: string;
    size: string;
    products: {
      name: string;
      code: string;
    } | null;
  } | null;
};

type SalePaymentRow = {
  id: string;
  amount: number;
  installments: number;
  authorization_code: string | null;
  notes: string | null;
  payment_methods: {
    name: string;
    type: string;
  } | null;
  card_brands: {
    name: string;
  } | null;
};

type SaleMovementRow = {
  id: string;
  quantity: number;
  stock_after: number;
  occurred_at: string;
  product_skus: {
    sku: string;
    products: {
      name: string;
    } | null;
  } | null;
};

type SaleItemRaw = {
  id: string | null;
  quantity: number | string | null;
  unit_price: number | string | null;
  discount_amount: number | string | null;
  total_amount: number | string | null;
  product_skus:
    | {
        sku: string | null;
        color: string | null;
        size: string | null;
        products:
          | {
              name: string | null;
              code: string | null;
            }
          | {
              name: string | null;
              code: string | null;
            }[]
          | null;
      }
    | {
        sku: string | null;
        color: string | null;
        size: string | null;
        products:
          | {
              name: string | null;
              code: string | null;
            }
          | {
              name: string | null;
              code: string | null;
            }[]
          | null;
      }[]
    | null;
};

type SalePaymentRaw = {
  id: string | null;
  amount: number | string | null;
  installments: number | string | null;
  authorization_code: string | null;
  notes: string | null;
  payment_methods:
    | {
        name: string | null;
        type: string | null;
      }
    | {
        name: string | null;
        type: string | null;
      }[]
    | null;
  card_brands:
    | {
        name: string | null;
      }
    | {
        name: string | null;
      }[]
    | null;
};

type SaleMovementRaw = {
  id: string | null;
  quantity: number | string | null;
  stock_after: number | string | null;
  occurred_at: string | null;
  product_skus:
    | {
        sku: string | null;
        products:
          | {
              name: string | null;
            }
          | {
              name: string | null;
            }[]
          | null;
      }
    | {
        sku: string | null;
        products:
          | {
              name: string | null;
            }
          | {
              name: string | null;
            }[]
          | null;
      }[]
    | null;
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function normalizeSaleItem(row: SaleItemRaw): SaleItemRow {
  const sku = firstRelation(row.product_skus);
  const product = firstRelation(sku?.products);
  return {
    id: String(row.id ?? ""),
    quantity: Number(row.quantity) || 0,
    unit_price: Number(row.unit_price) || 0,
    discount_amount: Number(row.discount_amount) || 0,
    total_amount: Number(row.total_amount) || 0,
    product_skus: sku
      ? {
          sku: String(sku.sku ?? ""),
          color: String(sku.color ?? ""),
          size: String(sku.size ?? ""),
          products: product
            ? {
                name: String(product.name ?? ""),
                code: String(product.code ?? ""),
              }
            : null,
        }
      : null,
  };
}

function normalizeSalePayment(row: SalePaymentRaw): SalePaymentRow {
  const method = firstRelation(row.payment_methods);
  const brand = firstRelation(row.card_brands);
  return {
    id: String(row.id ?? ""),
    amount: Number(row.amount) || 0,
    installments: Number(row.installments) || 1,
    authorization_code: row.authorization_code ?? null,
    notes: row.notes ?? null,
    payment_methods: method
      ? {
          name: String(method.name ?? ""),
          type: String(method.type ?? ""),
        }
      : null,
    card_brands: brand
      ? {
          name: String(brand.name ?? ""),
        }
      : null,
  };
}

function normalizeSaleMovement(row: SaleMovementRaw): SaleMovementRow {
  const sku = firstRelation(row.product_skus);
  const product = firstRelation(sku?.products);
  return {
    id: String(row.id ?? ""),
    quantity: Number(row.quantity) || 0,
    stock_after: Number(row.stock_after) || 0,
    occurred_at: String(row.occurred_at ?? ""),
    product_skus: sku
      ? {
          sku: String(sku.sku ?? ""),
          products: product
            ? {
                name: String(product.name ?? ""),
              }
            : null,
        }
      : null,
  };
}

export function SaleDetails() {
  const navigate = useNavigate();
  const { saleId } = useParams<{ saleId: string }>();
  const [sale, setSale] = useState<SaleDetail | null>(null);
  const [items, setItems] = useState<SaleItemRow[]>([]);
  const [payments, setPayments] = useState<SalePaymentRow[]>([]);
  const [movements, setMovements] = useState<SaleMovementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!saleId) return;
    const load = async () => {
      setLoading(true);
      setError(null);
      const [saleRes, itemsRes, paymentsRes, movementsRes] = await Promise.all([
        supabase
          .from("sales")
          .select(
            "id, number, status, subtotal, items_discount_total, discount_total, surcharge_total, total, paid_total, change_total, notes, created_at"
          )
          .eq("id", saleId)
          .single(),
        supabase
          .from("sale_items")
          .select("id, quantity, unit_price, discount_amount, total_amount, product_skus(sku, color, size, products(name, code))")
          .eq("sale_id", saleId)
          .order("created_at", { ascending: true }),
        supabase
          .from("sale_payments")
          .select("id, amount, installments, authorization_code, notes, payment_methods(name, type), card_brands(name)")
          .eq("sale_id", saleId)
          .order("created_at", { ascending: true }),
        supabase
          .from("stock_movements")
          .select("id, quantity, stock_after, occurred_at, product_skus(sku, products(name))")
          .eq("source_type", "SALE")
          .eq("source_id", saleId)
          .order("occurred_at", { ascending: true }),
      ]);
      setLoading(false);
      if (saleRes.error) {
        setError("Não foi possível carregar a venda.");
        return;
      }
      setSale((saleRes.data ?? null) as SaleDetail | null);
      setItems(((itemsRes.data ?? []) as SaleItemRaw[]).map((row) => normalizeSaleItem(row)));
      setPayments(((paymentsRes.data ?? []) as SalePaymentRaw[]).map((row) => normalizeSalePayment(row)));
      setMovements(((movementsRes.data ?? []) as SaleMovementRaw[]).map((row) => normalizeSaleMovement(row)));
    };
    load();
  }, [saleId]);

  return (
    <AppShell
      title="Detalhes da venda"
      actions={
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => navigate("/vendas")}>
            Voltar ao histórico
          </Button>
          <Button onClick={() => navigate("/pdv")}>
            Nova venda
          </Button>
        </div>
      }
    >
      {error && <p className="text-sm text-ember">{error}</p>}
      {loading && <p className="text-sm text-steel">Carregando detalhes...</p>}

      {!loading && sale && (
        <>
          <Card className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase text-steel">Venda #{sale.number}</p>
                <p className="text-lg font-semibold">{formatDate(sale.created_at)}</p>
              </div>
              <Badge
                tone={
                  sale.status === "COMPLETED"
                    ? "success"
                    : sale.status === "OPEN"
                      ? "warning"
                      : "danger"
                }
              >
                {sale.status}
              </Badge>
            </div>
            <div className="mt-4 grid gap-2 text-sm md:grid-cols-3">
              <p>Subtotal: <strong>{formatCurrency(Number(sale.subtotal) || 0)}</strong></p>
              <p>Desc. itens: <strong>{formatCurrency(Number(sale.items_discount_total) || 0)}</strong></p>
              <p>Desc. geral: <strong>{formatCurrency(Number(sale.discount_total) || 0)}</strong></p>
              <p>Acréscimo: <strong>{formatCurrency(Number(sale.surcharge_total) || 0)}</strong></p>
              <p>Total: <strong>{formatCurrency(Number(sale.total) || 0)}</strong></p>
              <p>Pago: <strong>{formatCurrency(Number(sale.paid_total) || 0)}</strong></p>
              <p>Troco: <strong>{formatCurrency(Number(sale.change_total) || 0)}</strong></p>
            </div>
            {sale.notes && <p className="mt-3 text-sm text-steel">Obs.: {sale.notes}</p>}
          </Card>

          <Card className="p-6">
            <p className="text-xs uppercase text-steel">Itens</p>
            <div className="mt-4 overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-steel">
                  <tr>
                    <th className="py-2">SKU</th>
                    <th>Produto</th>
                    <th>Qtd.</th>
                    <th>Unitário</th>
                    <th>Desconto</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td className="py-3 font-semibold">{item.product_skus?.sku ?? "-"}</td>
                      <td>{item.product_skus?.products?.name ?? "-"}</td>
                      <td>{item.quantity}</td>
                      <td>{formatCurrency(Number(item.unit_price) || 0)}</td>
                      <td>{formatCurrency(Number(item.discount_amount) || 0)}</td>
                      <td>{formatCurrency(Number(item.total_amount) || 0)}</td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-steel">
                        Sem itens registrados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-6">
            <p className="text-xs uppercase text-steel">Pagamentos</p>
            <div className="mt-4 overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-steel">
                  <tr>
                    <th className="py-2">Método</th>
                    <th>Bandeira</th>
                    <th>Valor</th>
                    <th>Parcelas</th>
                    <th>Autorização</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {payments.map((payment) => (
                    <tr key={payment.id}>
                      <td className="py-3 font-semibold">{payment.payment_methods?.name ?? "-"}</td>
                      <td>{payment.card_brands?.name ?? "-"}</td>
                      <td>{formatCurrency(Number(payment.amount) || 0)}</td>
                      <td>{payment.installments}</td>
                      <td>{payment.authorization_code ?? "-"}</td>
                    </tr>
                  ))}
                  {payments.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-steel">
                        Sem pagamentos registrados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-6">
            <p className="text-xs uppercase text-steel">Movimentações de estoque (SALE)</p>
            <div className="mt-4 overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-steel">
                  <tr>
                    <th className="py-2">Produto</th>
                    <th>SKU</th>
                    <th>Qtd. saída</th>
                    <th>Estoque após</th>
                    <th>Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {movements.map((movement) => (
                    <tr key={movement.id}>
                      <td className="py-3 font-semibold">{movement.product_skus?.products?.name ?? "-"}</td>
                      <td>{movement.product_skus?.sku ?? "-"}</td>
                      <td>{movement.quantity}</td>
                      <td>{movement.stock_after}</td>
                      <td>{formatDate(movement.occurred_at)}</td>
                    </tr>
                  ))}
                  {movements.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-steel">
                        Sem movimentações vinculadas.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </AppShell>
  );
}
