import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { ReturnModal } from "../components/pdv/ReturnModal";
import { useAuth } from "../lib/auth";
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
  sale_date: string | null;
  created_at: string;
  customer_id: string | null;
  customers: { full_name: string; phone: string | null } | null;
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
    sku_id: string;
    products: { name: string; code: string } | null;
  } | null;
};

type SalePaymentRow = {
  id: string;
  amount: number;
  installments: number;
  authorization_code: string | null;
  notes: string | null;
  due_date: string | null;
  payment_status: "PAID" | "PENDING";
  paid_at: string | null;
  payment_methods: { name: string; type: string } | null;
  card_brands: { name: string } | null;
};

type SaleMovementRow = {
  id: string;
  quantity: number;
  stock_after: number;
  occurred_at: string;
  source_type: string;
  product_skus: { sku: string; products: { name: string } | null } | null;
};

type SaleReturnRow = {
  id: string;
  reason: string | null;
  notes: string | null;
  total_amount: number;
  created_at: string;
  sale_return_items: {
    id: string;
    quantity: number;
    unit_price: number;
    total_amount: number;
    product_skus: { sku: string; products: { name: string } | null } | null;
  }[];
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

type CustomerResult = { id: string; full_name: string; phone: string | null };

type EditForm = {
  customer_id: string | null;
  customer_name: string;
  sale_date: string;
  notes: string;
};

export function SaleDetails() {
  const navigate = useNavigate();
  const { saleId } = useParams<{ saleId: string }>();
  const { profile } = useAuth();
  const canEdit = profile?.role === "ADMIN" || profile?.role === "GERENTE";

  const [sale, setSale] = useState<SaleDetail | null>(null);
  const [items, setItems] = useState<SaleItemRow[]>([]);
  const [payments, setPayments] = useState<SalePaymentRow[]>([]);
  const [movements, setMovements] = useState<SaleMovementRow[]>([]);
  const [returns, setReturns] = useState<SaleReturnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showReturn, setShowReturn] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);

  // Edit sale state
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>({ customer_id: null, customer_name: "", sale_date: "", notes: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerResult[]>([]);
  const [showCustomerDrop, setShowCustomerDrop] = useState(false);
  const customerDropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!customerQuery.trim()) { setCustomerResults([]); return; }
    const timeout = setTimeout(async () => {
      const { data } = await supabase
        .from("customers")
        .select("id, full_name, phone")
        .or(`full_name.ilike.%${customerQuery}%,phone.ilike.%${customerQuery}%`)
        .eq("status", "ATIVO")
        .limit(8);
      setCustomerResults((data ?? []) as CustomerResult[]);
      setShowCustomerDrop(true);
    }, 250);
    return () => clearTimeout(timeout);
  }, [customerQuery]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (customerDropRef.current && !customerDropRef.current.contains(e.target as Node)) {
        setShowCustomerDrop(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const openEdit = () => {
    if (!sale) return;
    setEditForm({
      customer_id: sale.customer_id,
      customer_name: sale.customers?.full_name ?? "",
      sale_date: sale.sale_date ?? "",
      notes: sale.notes ?? "",
    });
    setCustomerQuery(sale.customers?.full_name ?? "");
    setEditError(null);
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!sale) return;
    setEditSaving(true);
    setEditError(null);
    const { error: updateError } = await supabase
      .from("sales")
      .update({
        customer_id: editForm.customer_id || null,
        sale_date: editForm.sale_date || null,
        notes: editForm.notes || null,
      })
      .eq("id", sale.id);
    setEditSaving(false);
    if (updateError) {
      setEditError(updateError.message || "Não foi possível salvar as alterações.");
      return;
    }
    setEditOpen(false);
    loadData();
  };

  const loadData = async () => {
    if (!saleId) return;
    setLoading(true);
    setError(null);
    const [saleRes, itemsRes, paymentsRes, movementsRes, returnsRes] = await Promise.all([
      supabase
        .from("sales")
        .select("id, number, status, subtotal, items_discount_total, discount_total, surcharge_total, total, paid_total, change_total, notes, sale_date, created_at, customer_id, customers(full_name, phone)")
        .eq("id", saleId)
        .single(),
      supabase
        .from("sale_items")
        .select("id, quantity, unit_price, discount_amount, total_amount, product_skus(id, sku, color, size, products(name, code))")
        .eq("sale_id", saleId)
        .order("created_at", { ascending: true }),
      supabase
        .from("sale_payments")
        .select("id, amount, installments, authorization_code, notes, due_date, payment_status, paid_at, payment_methods(name, type), card_brands(name)")
        .eq("sale_id", saleId)
        .order("created_at", { ascending: true }),
      supabase
        .from("stock_movements")
        .select("id, quantity, stock_after, occurred_at, source_type, product_skus(sku, products(name))")
        .eq("source_id", saleId)
        .order("occurred_at", { ascending: true }),
      supabase
        .from("sale_returns")
        .select("id, reason, notes, total_amount, created_at, sale_return_items(id, quantity, unit_price, total_amount, product_skus(sku, products(name)))")
        .eq("sale_id", saleId)
        .order("created_at", { ascending: true }),
    ]);
    setLoading(false);

    if (saleRes.error) {
      setError("Não foi possível carregar a venda.");
      return;
    }

    const rawSale = saleRes.data as any;
    const customer = firstRelation(rawSale?.customers);
    setSale({
      ...rawSale,
      customers: customer ?? null,
    } as SaleDetail);

    setItems(
      ((itemsRes.data ?? []) as any[]).map((row) => {
        const sku = firstRelation(row.product_skus) as any;
        const product = firstRelation(sku?.products) as any;
        return {
          id: row.id,
          quantity: Number(row.quantity) || 0,
          unit_price: Number(row.unit_price) || 0,
          discount_amount: Number(row.discount_amount) || 0,
          total_amount: Number(row.total_amount) || 0,
          product_skus: sku ? {
            sku: sku.sku ?? "",
            color: sku.color ?? "",
            size: sku.size ?? "",
            sku_id: sku.id ?? row.product_skus?.id ?? "",
            products: product ? { name: product.name ?? "", code: product.code ?? "" } : null,
          } : null,
        } as SaleItemRow;
      })
    );

    setPayments(
      ((paymentsRes.data ?? []) as any[]).map((row) => {
        const method = firstRelation(row.payment_methods) as any;
        const brand = firstRelation(row.card_brands) as any;
        return {
          id: row.id,
          amount: Number(row.amount) || 0,
          installments: Number(row.installments) || 1,
          authorization_code: row.authorization_code ?? null,
          notes: row.notes ?? null,
          due_date: row.due_date ?? null,
          payment_status: row.payment_status ?? "PAID",
          paid_at: row.paid_at ?? null,
          payment_methods: method ? { name: method.name ?? "", type: method.type ?? "" } : null,
          card_brands: brand ? { name: brand.name ?? "" } : null,
        } as SalePaymentRow;
      })
    );

    setMovements(
      ((movementsRes.data ?? []) as any[]).map((row) => {
        const sku = firstRelation(row.product_skus) as any;
        const product = firstRelation(sku?.products) as any;
        return {
          id: row.id,
          quantity: Number(row.quantity) || 0,
          stock_after: Number(row.stock_after) || 0,
          occurred_at: row.occurred_at ?? "",
          source_type: row.source_type ?? "",
          product_skus: sku ? {
            sku: sku.sku ?? "",
            products: product ? { name: product.name ?? "" } : null,
          } : null,
        } as SaleMovementRow;
      })
    );

    setReturns(
      ((returnsRes.data ?? []) as any[]).map((row) => ({
        id: row.id,
        reason: row.reason ?? null,
        notes: row.notes ?? null,
        total_amount: Number(row.total_amount) || 0,
        created_at: row.created_at ?? "",
        sale_return_items: ((row.sale_return_items ?? []) as any[]).map((ri: any) => {
          const riSku = firstRelation(ri.product_skus) as any;
          const riProduct = firstRelation(riSku?.products) as any;
          return {
            id: ri.id,
            quantity: Number(ri.quantity) || 0,
            unit_price: Number(ri.unit_price) || 0,
            total_amount: Number(ri.total_amount) || 0,
            product_skus: riSku ? {
              sku: riSku.sku ?? "",
              products: riProduct ? { name: riProduct.name ?? "" } : null,
            } : null,
          };
        }),
      }))
    );
  };

  useEffect(() => {
    loadData();
  }, [saleId]);

  const markAsPaid = async (paymentId: string) => {
    setMarkingId(paymentId);
    const { error: rpcError } = await supabase.rpc("mark_consignment_paid", {
      payload: { sale_payment_id: paymentId },
    });
    setMarkingId(null);
    if (rpcError) {
      setError(rpcError.message || "Não foi possível quitar o consignado.");
      return;
    }
    setError(null);
    loadData();
  };

  const returnableItems = items.map((item) => ({
    sale_item_id: item.id,
    sku_id: item.product_skus?.sku_id ?? "",
    sku: item.product_skus?.sku ?? "",
    product_name: item.product_skus?.products?.name ?? "",
    quantity: item.quantity,
    unit_price: item.unit_price,
  }));

  const hasPendingConsignment = payments.some((p) => p.payment_status === "PENDING");

  return (
    <AppShell
      title="Detalhes da venda"
      actions={
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => navigate("/vendas")}>
            Voltar ao histórico
          </Button>
          {canEdit && sale && (
            <Button variant="outline" onClick={openEdit}>
              Editar venda
            </Button>
          )}
          {items.length > 0 && (
            <Button variant="outline" onClick={() => setShowReturn(true)}>
              Devolver itens
            </Button>
          )}
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
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase text-steel">Venda #{sale.number}</p>
                <p className="text-lg font-semibold">
                  {sale.sale_date ? formatDate(sale.sale_date) : formatDate(sale.created_at)}
                </p>
                {sale.customers && (
                  <p className="mt-1 text-sm text-steel">
                    Cliente: <strong className="text-ink">{sale.customers.full_name}</strong>
                    {sale.customers.phone && <span className="ml-2">· {sale.customers.phone}</span>}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge
                  tone={
                    sale.status === "COMPLETED" ? "success"
                      : sale.status === "OPEN" ? "warning"
                      : "danger"
                  }
                >
                  {sale.status}
                </Badge>
                {hasPendingConsignment && <Badge tone="warning">Consignado pendente</Badge>}
              </div>
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
                      <td colSpan={6} className="py-6 text-center text-steel">Sem itens registrados.</td>
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
                    <th>Status</th>
                    <th>Vencimento</th>
                    <th>Autorização</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {payments.map((payment) => (
                    <tr key={payment.id}>
                      <td className="py-3 font-semibold">{payment.payment_methods?.name ?? "-"}</td>
                      <td>{payment.card_brands?.name ?? "-"}</td>
                      <td>{formatCurrency(Number(payment.amount) || 0)}</td>
                      <td>{payment.installments}</td>
                      <td>
                        <Badge tone={payment.payment_status === "PENDING" ? "warning" : "success"}>
                          {payment.payment_status === "PENDING" ? "Pendente" : "Pago"}
                        </Badge>
                      </td>
                      <td>{payment.due_date ? formatDate(payment.due_date) : "-"}</td>
                      <td>{payment.authorization_code ?? "-"}</td>
                      <td>
                        {payment.payment_status === "PENDING" && (
                          <Button
                            variant="outline"
                            onClick={() => markAsPaid(payment.id)}
                            disabled={markingId === payment.id}
                          >
                            {markingId === payment.id ? "Quitando..." : "Quitar"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {payments.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-6 text-center text-steel">Sem pagamentos registrados.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-6">
            <p className="text-xs uppercase text-steel">Movimentações de estoque</p>
            <div className="mt-4 overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-steel">
                  <tr>
                    <th className="py-2">Produto</th>
                    <th>SKU</th>
                    <th>Tipo</th>
                    <th>Qtd.</th>
                    <th>Estoque após</th>
                    <th>Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {movements.map((movement) => (
                    <tr key={movement.id}>
                      <td className="py-3 font-semibold">{movement.product_skus?.products?.name ?? "-"}</td>
                      <td>{movement.product_skus?.sku ?? "-"}</td>
                      <td>
                        <Badge tone={movement.source_type === "RETURN" ? "success" : "neutral"}>
                          {movement.source_type === "RETURN" ? "Devolução" : "Venda"}
                        </Badge>
                      </td>
                      <td>{movement.quantity}</td>
                      <td>{movement.stock_after}</td>
                      <td>{formatDate(movement.occurred_at)}</td>
                    </tr>
                  ))}
                  {movements.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-steel">Sem movimentações vinculadas.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {returns.length > 0 && (
            <Card className="p-6">
              <p className="text-xs uppercase text-steel">Devoluções</p>
              <div className="mt-4 space-y-4">
                {returns.map((ret) => (
                  <div key={ret.id} className="rounded-2xl border border-black/10 p-4">
                    <div className="flex flex-wrap justify-between gap-2 text-sm">
                      <span className="font-semibold">Devolução em {formatDate(ret.created_at)}</span>
                      <span className="font-semibold">{formatCurrency(Number(ret.total_amount))}</span>
                    </div>
                    {ret.reason && <p className="mt-1 text-xs text-steel">Motivo: {ret.reason}</p>}
                    <div className="mt-3 overflow-auto">
                      <table className="w-full text-sm">
                        <thead className="text-xs uppercase text-steel">
                          <tr>
                            <th className="pb-1 text-left">SKU</th>
                            <th className="pb-1 text-left">Produto</th>
                            <th className="pb-1 text-right">Qtd.</th>
                            <th className="pb-1 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-black/5">
                          {ret.sale_return_items.map((ri) => (
                            <tr key={ri.id}>
                              <td className="py-1 font-semibold">{ri.product_skus?.sku ?? "-"}</td>
                              <td className="py-1 text-steel">{ri.product_skus?.products?.name ?? "-"}</td>
                              <td className="py-1 text-right">{ri.quantity}</td>
                              <td className="py-1 text-right">{formatCurrency(Number(ri.total_amount))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      <Modal open={editOpen} onClose={() => setEditOpen(false)}>
        <p className="text-lg font-semibold">Editar venda #{sale?.number}</p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="relative md:col-span-2" ref={customerDropRef}>
            <label className="text-xs uppercase text-steel">Cliente</label>
            <Input
              value={customerQuery}
              onChange={(e) => {
                setCustomerQuery(e.target.value);
                if (!e.target.value.trim()) {
                  setEditForm((f) => ({ ...f, customer_id: null, customer_name: "" }));
                }
              }}
              placeholder="Buscar por nome ou telefone"
            />
            {editForm.customer_id && (
              <p className="mt-1 text-xs text-steel">
                Selecionado: <strong>{editForm.customer_name}</strong>
                <button
                  className="ml-2 text-ember underline"
                  onClick={() => {
                    setEditForm((f) => ({ ...f, customer_id: null, customer_name: "" }));
                    setCustomerQuery("");
                  }}
                >
                  Limpar
                </button>
              </p>
            )}
            {showCustomerDrop && customerResults.length > 0 && (
              <div className="absolute z-20 mt-1 w-full rounded-2xl border border-black/10 bg-white shadow-lg">
                {customerResults.map((c) => (
                  <button
                    key={c.id}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-black/5"
                    onMouseDown={() => {
                      setEditForm((f) => ({ ...f, customer_id: c.id, customer_name: c.full_name }));
                      setCustomerQuery(c.full_name);
                      setShowCustomerDrop(false);
                    }}
                  >
                    <span className="font-medium">{c.full_name}</span>
                    {c.phone && <span className="text-steel">{c.phone}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="text-xs uppercase text-steel">Data da venda</label>
            <input
              type="date"
              className="input"
              value={editForm.sale_date}
              onChange={(e) => setEditForm((f) => ({ ...f, sale_date: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs uppercase text-steel">Observações</label>
            <Input
              value={editForm.notes}
              onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Opcional"
            />
          </div>
        </div>
        {editError && <p className="mt-3 text-sm text-ember">{editError}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
          <Button onClick={handleSaveEdit} disabled={editSaving}>
            {editSaving ? "Salvando..." : "Salvar alterações"}
          </Button>
        </div>
      </Modal>

      {sale && (
        <ReturnModal
          open={showReturn}
          onClose={() => setShowReturn(false)}
          saleId={sale.id}
          saleNumber={sale.number}
          items={returnableItems}
          onSuccess={loadData}
        />
      )}
    </AppShell>
  );
}
