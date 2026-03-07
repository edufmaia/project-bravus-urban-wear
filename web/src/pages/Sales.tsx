import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { supabase } from "../lib/supabaseClient";
import { formatCurrency, formatDate } from "../lib/utils";

type SaleRow = {
  id: string;
  number: number;
  status: "OPEN" | "COMPLETED" | "CANCELED";
  total: number;
  paid_total: number;
  change_total: number;
  created_at: string;
};

export function Sales() {
  const navigate = useNavigate();
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data, error: loadError } = await supabase
        .from("sales")
        .select("id, number, status, total, paid_total, change_total, created_at")
        .order("created_at", { ascending: false })
        .limit(300);
      setLoading(false);
      if (loadError) {
        setError("Não foi possível carregar o histórico de vendas.");
        return;
      }
      setSales((data ?? []) as SaleRow[]);
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim();
    if (!term) return sales;
    return sales.filter((sale) => sale.number.toString().includes(term));
  }, [sales, search]);

  return (
    <AppShell
      title="Vendas"
      actions={
        <Button onClick={() => navigate("/pdv")}>
          Nova venda
        </Button>
      }
    >
      {error && <p className="text-sm text-ember">{error}</p>}
      <Card className="p-6">
        <div className="grid gap-4 md:grid-cols-[1fr_auto]">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por número da venda"
          />
          <Badge tone="neutral">{filtered.length} registros</Badge>
        </div>
      </Card>

      <Card className="p-6">
        {loading ? (
          <p className="text-sm text-steel">Carregando vendas...</p>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-steel">
                <tr>
                  <th className="py-2">Número</th>
                  <th>Data</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th>Pago</th>
                  <th>Troco</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {filtered.map((sale) => (
                  <tr key={sale.id}>
                    <td className="py-3 font-semibold">#{sale.number}</td>
                    <td>{formatDate(sale.created_at)}</td>
                    <td>
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
                    </td>
                    <td>{formatCurrency(Number(sale.total) || 0)}</td>
                    <td>{formatCurrency(Number(sale.paid_total) || 0)}</td>
                    <td>{formatCurrency(Number(sale.change_total) || 0)}</td>
                    <td>
                      <Button variant="outline" onClick={() => navigate(`/vendas/${sale.id}`)}>
                        Detalhes
                      </Button>
                    </td>
                  </tr>
                ))}
                {!filtered.length && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-steel">
                      Nenhuma venda encontrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </AppShell>
  );
}
