import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../components/layout/AppShell";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";
import { formatDate } from "../lib/utils";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth";

const filters = [
  { label: "7 dias", days: 7 },
  { label: "15 dias", days: 15 },
  { label: "30 dias", days: 30 },
  { label: "90 dias", days: 90 },
];

export function Movements() {
  const { profile } = useAuth();
  const role = profile?.role ?? "VISUALIZADOR";
  const canWrite = ["ADMIN", "GERENTE", "OPERADOR"].includes(role);

  const [type, setType] = useState<"ENTRADA" | "SAIDA" | "AJUSTE">("ENTRADA");
  const [adjustment, setAdjustment] = useState<"ADD" | "REMOVE">("ADD");
  const [skus, setSkus] = useState<any[]>([]);
  const [selectedSku, setSelectedSku] = useState<string>("");
  const [quantity, setQuantity] = useState(0);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [history, setHistory] = useState<any[]>([]);
  const [filterDays, setFilterDays] = useState(30);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    const { data: skuData } = await supabase
      .from("product_skus")
      .select("id, sku, color, size, stock_current, products(name)")
      .order("created_at", { ascending: false });
    setSkus(skuData ?? []);

    const since = new Date();
    since.setDate(since.getDate() - filterDays);
    const { data: movementData } = await supabase
      .from("stock_movements")
      .select("id, type, quantity, reason, notes, occurred_at, stock_after, product_skus(sku, products(name))")
      .gte("occurred_at", since.toISOString())
      .order("occurred_at", { ascending: false });
    setHistory(movementData ?? []);
  };

  useEffect(() => {
    loadData();
  }, [filterDays]);

  const saveMovement = async () => {
    if (!canWrite) {
      setError("Seu perfil não tem permissão para criar movimentações.");
      return;
    }
    const normalizedQuantity = Number(quantity);
    if (!selectedSku || !Number.isFinite(normalizedQuantity) || normalizedQuantity <= 0 || !reason) {
      setError("Preencha SKU, quantidade válida e motivo.");
      return;
    }
    setError(null);
    const signed =
      type === "ENTRADA"
        ? normalizedQuantity
        : type === "SAIDA"
          ? -normalizedQuantity
          : adjustment === "ADD"
            ? normalizedQuantity
            : -normalizedQuantity;
    const selectedSkuData = skus.find((sku) => sku.id === selectedSku);
    const currentStock = Number(selectedSkuData?.stock_current ?? 0);
    if (!Number.isFinite(currentStock)) {
      setError("Não foi possível validar o estoque atual do SKU selecionado.");
      return;
    }
    if (currentStock + signed < 0) {
      setError(`Estoque insuficiente. Disponível: ${currentStock}.`);
      return;
    }
    const { error: insertError } = await supabase.from("stock_movements").insert({
      sku_id: selectedSku,
      type,
      quantity: normalizedQuantity,
      signed_quantity: signed,
      reason,
      notes,
    });
    if (insertError) {
      setError(insertError.message || "Não foi possível salvar a movimentação. Verifique permissões ou estoque.");
      return;
    }
    setQuantity(0);
    setReason("");
    setNotes("");
    await loadData();
  };

  const exportCsv = () => {
    const header = "sku,product,type,quantity,reason,notes,occurred_at,stock_after";
    const lines = history.map((movement) => {
      return [
        movement.product_skus?.sku,
        movement.product_skus?.products?.name,
        movement.type,
        movement.quantity,
        movement.reason,
        movement.notes ?? "",
        movement.occurred_at,
        movement.stock_after,
      ].join(",");
    });
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "bravus-urban-wear-movimentacoes.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const skuOptions = useMemo(
    () =>
      skus.map((sku) => ({
        value: sku.id,
        label: `${sku.products?.name ?? "Produto"} - ${sku.color}/${sku.size} (${sku.sku})`,
      })),
    [skus]
  );

  return (
    <AppShell title="Movimentações" actions={<Button onClick={exportCsv}>Exportar CSV</Button>}>
      {error && <p className="text-sm text-ember">{error}</p>}
      <Card className="p-6">
        <p className="text-xs uppercase text-steel">Nova movimentação</p>
        <div className="mt-4 flex flex-wrap gap-3">
          {(["ENTRADA", "SAIDA", "AJUSTE"] as const).map((item) => (
            <button
              key={item}
              onClick={() => setType(item)}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                type === item ? "bg-ink text-white" : "bg-black/5 text-ink"
              }`}
              disabled={!canWrite}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-xs font-semibold uppercase text-steel">SKU</label>
            <select className="input" value={selectedSku} onChange={(event) => setSelectedSku(event.target.value)} disabled={!canWrite}>
              <option value="">Selecione um SKU</option>
              {skuOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase text-steel">Quantidade</label>
            <Input type="number" value={quantity || ""} onChange={(event) => setQuantity(Number(event.target.value))} disabled={!canWrite} />
          </div>
          {type === "AJUSTE" && (
            <div>
              <label className="text-xs font-semibold uppercase text-steel">Direção do ajuste</label>
              <select className="input" value={adjustment} onChange={(event) => setAdjustment(event.target.value as any)} disabled={!canWrite}>
                <option value="ADD">Adicionar ao estoque</option>
                <option value="REMOVE">Remover do estoque</option>
              </select>
            </div>
          )}
          <div>
            <label className="text-xs font-semibold uppercase text-steel">Motivo</label>
            <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Compra, venda, ajuste" disabled={!canWrite} />
          </div>
        </div>
        <div className="mt-4">
          <label className="text-xs font-semibold uppercase text-steel">Observações</label>
          <Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Notas adicionais" disabled={!canWrite} />
        </div>
        <div className="mt-6 flex justify-end">
          <Button onClick={saveMovement} disabled={!canWrite}>Salvar movimentação</Button>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase text-steel">Histórico</p>
            <p className="text-lg font-semibold">Últimas movimentações</p>
          </div>
          <div className="flex gap-2">
            {filters.map((filter) => (
              <button
                key={filter.label}
                onClick={() => setFilterDays(filter.days)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  filterDays === filter.days ? "bg-ink text-white" : "bg-black/5 text-ink"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-steel">
              <tr>
                <th className="py-2">Produto</th>
                <th>SKU</th>
                <th>Tipo</th>
                <th>Quantidade</th>
                <th>Motivo</th>
                <th>Data</th>
                <th>Estoque após</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {history.map((movement) => (
                <tr key={movement.id}>
                  <td className="py-3 font-semibold">{movement.product_skus?.products?.name}</td>
                  <td>{movement.product_skus?.sku}</td>
                  <td>
                    <Badge tone={movement.type === "SAIDA" ? "danger" : movement.type === "ENTRADA" ? "success" : "neutral"}>
                      {movement.type}
                    </Badge>
                  </td>
                  <td>{movement.quantity}</td>
                  <td>{movement.reason}</td>
                  <td>{formatDate(movement.occurred_at)}</td>
                  <td>{movement.stock_after ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </AppShell>
  );
}
