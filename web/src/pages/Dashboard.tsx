import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../components/layout/AppShell";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { formatCurrency, formatDate } from "../lib/utils";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const rangeDays = [
  { label: "7 dias", days: 7 },
  { label: "30 dias", days: 30 },
  { label: "90 dias", days: 90 },
];

export function Dashboard() {
  const { profile } = useAuth();
  const canManageCatalog = ["ADMIN", "GERENTE"].includes(profile?.role ?? "VISUALIZADOR");
  const [stats, setStats] = useState({
    products: 0,
    lowStock: 0,
    stockValue: 0,
    suppliers: 0,
    revenuePotential: 0,
  });
  const [categoryData, setCategoryData] = useState<{ name: string; value: number }[]>([]);
  const [timeline, setTimeline] = useState<{ date: string; current: number; ideal: number }[]>([]);
  const [recent, setRecent] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      const [{ count: products }, { count: suppliers }] = await Promise.all([
        supabase.from("products").select("id", { count: "exact", head: true }),
        supabase.from("suppliers").select("id", { count: "exact", head: true }),
      ]);

      const { data: skus } = await supabase
        .from("product_skus")
        .select("id, stock_current, stock_min, cost, price, products(category)");

      const lowStock = skus?.filter((sku) => (sku.stock_current ?? 0) <= (sku.stock_min ?? 0)).length ?? 0;
      const stockValue =
        skus?.reduce((sum, sku) => {
          if (sku.price === null || sku.price === undefined) return sum;
          return sum + (Number(sku.stock_current) || 0) * (Number(sku.cost) || 0);
        }, 0) ?? 0;
      const revenuePotential =
        skus?.reduce((sum, sku) => {
          if (sku.price === null || sku.price === undefined) return sum;
          return sum + (Number(sku.stock_current) || 0) * (Number(sku.price) || 0);
        }, 0) ?? 0;

      setStats({ products: products ?? 0, suppliers: suppliers ?? 0, lowStock, stockValue, revenuePotential });

      const categories = new Map<string, number>();
      skus?.forEach((sku) => {
        const category = (sku as any).products?.category ?? "Outros";
        categories.set(category, (categories.get(category) ?? 0) + 1);
      });
      setCategoryData(Array.from(categories, ([name, value]) => ({ name, value })));

      const base = new Date();
      const timelineData = Array.from({ length: 10 }).map((_, index) => {
        const date = new Date(base);
        date.setDate(base.getDate() - (9 - index) * 3);
        const current = skus?.reduce((sum, sku) => sum + (Number(sku.stock_current) || 0), 0) ?? 0;
        return {
          date: formatDate(date),
          current: current - index * 3,
          ideal: current + 40,
        };
      });
      setTimeline(timelineData);

      const { data: movements } = await supabase
        .from("stock_movements")
        .select("id, type, quantity, reason, occurred_at, product_skus(sku, products(name))")
        .order("occurred_at", { ascending: false })
        .limit(6);
      setRecent(movements ?? []);
    };

    load();
  }, []);

  const donutColors = useMemo(() => ["#101014", "#ff6b3d", "#c6ff43", "#2563eb", "#f97316"], []);

  return (
    <AppShell title="Dashboard">
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="p-6">
          <p className="text-xs uppercase text-steel">Produtos ativos</p>
          <p className="mt-4 text-3xl font-semibold">{stats.products}</p>
          <Badge className="mt-4" tone="neutral">
            +12% no mês
          </Badge>
        </Card>
        <Card className="p-6">
          <p className="text-xs uppercase text-steel">Estoque baixo</p>
          <p className="mt-4 text-3xl font-semibold">{stats.lowStock}</p>
          <Badge className="mt-4" tone="warning">
            atenção em SKUs críticos
          </Badge>
        </Card>
        <Card className="p-6">
          <p className="text-xs uppercase text-steel">Valor em estoque</p>
          <p className="mt-4 text-3xl font-semibold">{canManageCatalog ? formatCurrency(stats.stockValue) : "-"}</p>
          <Badge className="mt-4" tone="success">
            saúde financeira
          </Badge>
        </Card>
        <Card className="p-6">
          <p className="text-xs uppercase text-steel">Receita potencial</p>
          <p className="mt-4 text-3xl font-semibold">{formatCurrency(stats.revenuePotential)}</p>
          <p className="mt-2 text-xs text-steel">SKUs sem preço não entram nos KPIs financeiros.</p>
        </Card>
        <Card className="p-6">
          <p className="text-xs uppercase text-steel">Fornecedores</p>
          <p className="mt-4 text-3xl font-semibold">{stats.suppliers}</p>
          <Badge className="mt-4" tone="neutral">
            ativos na coleção
          </Badge>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase text-steel">Estoque atual vs ideal</p>
              <p className="text-lg font-semibold">Série temporal</p>
            </div>
            <div className="flex gap-2">
              {rangeDays.map((range) => (
                <button key={range.label} className="rounded-full border border-black/10 px-3 py-1 text-xs">
                  {range.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-6 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeline}>
                <defs>
                  <linearGradient id="colorCurrent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#101014" stopOpacity={0.7} />
                    <stop offset="100%" stopColor="#101014" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="colorIdeal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#c6ff43" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#c6ff43" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="current" stroke="#101014" fill="url(#colorCurrent)" name="Atual" />
                <Area type="monotone" dataKey="ideal" stroke="#c6ff43" fill="url(#colorIdeal)" name="Ideal" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6">
          <p className="text-xs uppercase text-steel">Categorias</p>
          <p className="text-lg font-semibold">Distribuição de SKUs</p>
          <div className="mt-6 h-60">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={categoryData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90}>
                  {categoryData.map((_, index) => (
                    <Cell key={index} fill={donutColors[index % donutColors.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 space-y-2">
            {categoryData.map((item, index) => (
              <div key={item.name} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: donutColors[index % donutColors.length] }} />
                  {item.name}
                </span>
                <span className="font-semibold">{item.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase text-steel">Atividades recentes</p>
            <p className="text-lg font-semibold">Últimas movimentações</p>
          </div>
          <Badge tone="neutral">Atualizado agora</Badge>
        </div>
        <div className="mt-4 divide-y divide-black/5">
          {recent.map((movement) => (
            <div key={movement.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
              <div>
                <p className="font-semibold">
                  {(movement.product_skus?.products?.name ?? "SKU")} • {movement.product_skus?.sku}
                </p>
                <p className="text-xs text-steel">{movement.reason}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold">{movement.type}</p>
                <p className="text-xs text-steel">{formatDate(movement.occurred_at)}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </AppShell>
  );
}
