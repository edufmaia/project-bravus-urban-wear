import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { supabase } from "../lib/supabaseClient";
import { formatCurrency, formatDate } from "../lib/utils";

type ConsignmentRow = {
  id: string;
  amount: number;
  due_date: string | null;
  payment_status: "PAID" | "PENDING";
  paid_at: string | null;
  sales: {
    id: string;
    number: number;
    customers: { id: string; full_name: string; phone: string | null } | null;
  } | null;
};

type FilterType = "PENDING" | "PAID" | "ALL";

export function Consignments() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ConsignmentRow[]>([]);
  const [filter, setFilter] = useState<FilterType>("PENDING");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const today = new Date().toISOString().split("T")[0];

  const loadData = async () => {
    setLoading(true);
    const query = supabase
      .from("sale_payments")
      .select(`
        id, amount, due_date, payment_status, paid_at,
        sales!inner(id, number, customers(id, full_name, phone))
      `)
      .in("payment_status", filter === "ALL" ? ["PENDING", "PAID"] : [filter])
      .order("due_date", { ascending: true });

    const { data, error: loadError } = await query;
    setLoading(false);
    if (loadError) {
      setError("Não foi possível carregar os consignados.");
      return;
    }
    setRows((data ?? []) as unknown as ConsignmentRow[]);
  };

  useEffect(() => {
    loadData();
  }, [filter]);

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

  const getSale = (row: ConsignmentRow) => {
    if (Array.isArray(row.sales)) return row.sales[0] ?? null;
    return row.sales;
  };

  const getCustomer = (sale: ReturnType<typeof getSale>) => {
    if (!sale) return null;
    if (Array.isArray(sale.customers)) return sale.customers[0] ?? null;
    return sale.customers;
  };

  const isOverdue = (dueDate: string | null) =>
    dueDate !== null && dueDate < today;

  const pendingTotal = rows
    .filter((r) => r.payment_status === "PENDING")
    .reduce((sum, r) => sum + Number(r.amount), 0);

  return (
    <AppShell title="Consignados">
      {error && <p className="text-sm text-ember">{error}</p>}

      <div className="flex flex-wrap gap-2">
        {(["PENDING", "PAID", "ALL"] as FilterType[]).map((f) => (
          <Button
            key={f}
            variant={filter === f ? "primary" : "outline"}
            onClick={() => setFilter(f)}
          >
            {f === "PENDING" ? "Pendentes" : f === "PAID" ? "Pagos" : "Todos"}
          </Button>
        ))}
      </div>

      {filter !== "PAID" && (
        <Card className="p-4">
          <p className="text-xs uppercase text-steel">Total pendente</p>
          <p className="text-2xl font-semibold">{formatCurrency(pendingTotal)}</p>
        </Card>
      )}

      <Card className="p-6">
        {loading ? (
          <p className="text-sm text-steel">Carregando...</p>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-steel">
                <tr>
                  <th className="py-2">Cliente</th>
                  <th>Telefone</th>
                  <th>Venda #</th>
                  <th>Valor</th>
                  <th>Vencimento</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-steel">
                      Nenhum registro encontrado.
                    </td>
                  </tr>
                )}
                {rows.map((row) => {
                  const sale = getSale(row);
                  const customer = getCustomer(sale);
                  const overdue = row.payment_status === "PENDING" && isOverdue(row.due_date);
                  return (
                    <tr key={row.id} className={overdue ? "bg-ember/5" : ""}>
                      <td className="py-3 font-medium">
                        {customer?.full_name ?? "—"}
                      </td>
                      <td className="text-steel">{customer?.phone ?? "—"}</td>
                      <td>
                        {sale ? (
                          <button
                            className="font-semibold text-ink underline hover:text-ember"
                            onClick={() => navigate(`/vendas/${sale.id}`)}
                          >
                            #{sale.number}
                          </button>
                        ) : "—"}
                      </td>
                      <td className="font-semibold">{formatCurrency(Number(row.amount))}</td>
                      <td>
                        {row.due_date ? (
                          <span className={overdue ? "font-semibold text-ember" : ""}>
                            {formatDate(row.due_date)}
                            {overdue && " ⚠ Vencido"}
                          </span>
                        ) : "—"}
                      </td>
                      <td>
                        <Badge tone={row.payment_status === "PENDING" ? (overdue ? "danger" : "warning") : "success"}>
                          {row.payment_status === "PENDING" ? "Pendente" : "Pago"}
                        </Badge>
                      </td>
                      <td>
                        {row.payment_status === "PENDING" && (
                          <Button
                            variant="outline"
                            onClick={() => markAsPaid(row.id)}
                            disabled={markingId === row.id}
                          >
                            {markingId === row.id ? "Quitando..." : "Marcar como pago"}
                          </Button>
                        )}
                        {row.payment_status === "PAID" && row.paid_at && (
                          <span className="text-xs text-steel">Pago em {formatDate(row.paid_at)}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </AppShell>
  );
}
