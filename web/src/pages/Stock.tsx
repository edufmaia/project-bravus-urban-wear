import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { AppShell } from "../components/layout/AppShell";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { formatCurrency, formatDate, parseNumberOrNull, safeParseNumber } from "../lib/utils";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth";

export function Stock() {
  const { profile } = useAuth();
  const role = profile?.role ?? "VISUALIZADOR";
  const canManageCatalog = ["ADMIN", "GERENTE"].includes(role);

  const [rows, setRows] = useState<any[]>([]);
  const [skuModalOpen, setSkuModalOpen] = useState(false);
  const [skuForm, setSkuForm] = useState({
    id: "",
    cost: "",
    price: "",
    stock_current: "0",
    stock_min: "",
    status: "ATIVO",
  });
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const { data, error: loadError } = await supabase.from("stock_overview").select("*").order("product_name");
    if (loadError) {
      setError("Não foi possível carregar o estoque.");
      return;
    }
    setRows(data ?? []);
  };

  useEffect(() => {
    load();
  }, []);

  const statusLabel = (row: any) => {
    const stock = Number(row.stock_current) || 0;
    const min = Number(row.stock_min) || 0;
    if (stock === 0) return { label: "Fora", tone: "danger" as const };
    if (stock <= min) return { label: "Crítico", tone: "warning" as const };
    if (stock <= min * 2) return { label: "Instável", tone: "neutral" as const };
    return { label: "Estável", tone: "success" as const };
  };

  const openEditSku = (row: any) => {
    setSkuForm({
      id: row.sku_id,
      cost: row.cost?.toString() ?? "",
      price: row.price?.toString() ?? "",
      stock_current: row.stock_current?.toString() ?? "0",
      stock_min: row.stock_min?.toString() ?? "",
      status: row.status ?? "ATIVO",
    });
    setSkuModalOpen(true);
  };

  const saveSku = async () => {
    if (!canManageCatalog) return;
    setError(null);
    const desiredStock = Number(skuForm.stock_current);
    if (!Number.isInteger(desiredStock) || desiredStock < 0) {
      setError("Estoque atual deve ser um número inteiro maior ou igual a zero.");
      return;
    }
    const { data: currentSku, error: currentError } = await supabase
      .from("product_skus")
      .select("stock_current")
      .eq("id", skuForm.id)
      .single();
    if (currentError) {
      setError("Não foi possível consultar o estoque atual do SKU.");
      return;
    }
    const currentStock = Number(currentSku.stock_current) || 0;
    const payload = {
      cost: safeParseNumber(skuForm.cost),
      price: parseNumberOrNull(skuForm.price) ?? null,
      stock_min: Number(skuForm.stock_min) || 0,
      status: skuForm.status,
    };
    const { error: updateError } = await supabase.from("product_skus").update(payload).eq("id", skuForm.id);
    if (updateError) {
      setError("Não foi possível salvar o SKU.");
      return;
    }
    const stockDiff = desiredStock - currentStock;
    if (stockDiff !== 0) {
      const { error: movementError } = await supabase.from("stock_movements").insert({
        sku_id: skuForm.id,
        type: "AJUSTE",
        quantity: Math.abs(stockDiff),
        signed_quantity: stockDiff,
        reason: "AJUSTE_MANUAL",
        notes: "Ajuste realizado na tela de estoque.",
      });
      if (movementError) {
        setError("SKU salvo, mas não foi possível ajustar o estoque atual.");
        return;
      }
    }
    setSkuModalOpen(false);
    await load();
  };

  const deleteSku = async (skuId: string) => {
    if (!canManageCatalog) return;
    const { error: deleteError } = await supabase.from("product_skus").delete().eq("id", skuId);
    if (deleteError) {
      setError("Não foi possível excluir o SKU.");
      return;
    }
    await load();
  };

  const exportCsv = () => {
    const header =
      "product_name,sku,supplier,category,last_entry,last_exit,cost,price,margin,stock_current,status";
    const lines = rows.map((row) => {
      return [
        row.product_name ?? "",
        row.sku ?? "",
        row.supplier_name ?? "",
        row.category ?? "",
        row.last_entry ?? "",
        row.last_exit ?? "",
        row.cost ?? "",
        row.price ?? "",
        row.margin ?? "",
        row.stock_current ?? 0,
        row.status ?? "ATIVO",
      ].join(",");
    });
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "bravus-urban-wear-estoque.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportXlsx = () => {
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "stock_overview");
    XLSX.writeFile(workbook, "bravus-urban-wear-estoque.xlsx");
  };

  const getMarginPercent = (row: any) => {
    if (row.margin !== null && row.margin !== undefined && !Number.isNaN(Number(row.margin))) {
      return Number(row.margin);
    }
    const cost = Number(row.cost);
    const price = Number(row.price);
    if (!Number.isFinite(cost) || !Number.isFinite(price) || price === 0) return null;
    return ((price - cost) / price) * 100;
  };

  return (
    <AppShell
      title="Estoque"
      actions={
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={exportCsv}>Exportar CSV</Button>
          <Button variant="outline" onClick={exportXlsx}>Exportar XLSX</Button>
        </div>
      }
    >
      {error && <p className="text-sm text-ember">{error}</p>}
      <Card className="p-6">
        <div className="overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-steel">
              <tr>
                <th className="py-2">Produto</th>
                <th>SKU</th>
                <th>Fornecedor</th>
                <th>Categoria</th>
                <th>Últ. Entrada</th>
                <th>Últ. Saída</th>
                <th>Custo</th>
                <th>Preço</th>
                <th>Margem</th>
                <th>Estoque</th>
                <th>Status</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {rows.map((row) => {
                const status = statusLabel(row);
                return (
                  <tr key={row.sku_id}>
                    <td className="py-3 font-semibold">{row.product_name}</td>
                    <td>{row.sku}</td>
                    <td>{row.supplier_name ?? "-"}</td>
                    <td>{row.category ?? "-"}</td>
                    <td>{formatDate(row.last_entry)}</td>
                    <td>{formatDate(row.last_exit)}</td>
                    <td>{canManageCatalog ? (row.cost === null ? "-" : formatCurrency(Number(row.cost))) : "-"}</td>
                    <td>
                      {row.price === null ? (
                        <Badge tone="warning">Sem preço de venda</Badge>
                      ) : (
                        formatCurrency(Number(row.price))
                      )}
                    </td>
                    <td>
                      {canManageCatalog && getMarginPercent(row) !== null
                        ? `${getMarginPercent(row)!.toFixed(1)}%`
                        : "-"}
                    </td>
                    <td>{row.stock_current}</td>
                    <td>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </td>
                    <td>
                      {canManageCatalog ? (
                        <div className="flex gap-2">
                          <Button variant="outline" onClick={() => openEditSku(row)}>Editar</Button>
                          <Button variant="ghost" onClick={() => deleteSku(row.sku_id)}>Excluir</Button>
                        </div>
                      ) : (
                        <span className="text-xs text-steel">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={skuModalOpen} onClose={() => setSkuModalOpen(false)}>
        <div className="space-y-4">
          <p className="text-2xl font-semibold">Editar SKU</p>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs uppercase text-steel">Custo</label>
              <Input value={skuForm.cost} onChange={(event) => setSkuForm({ ...skuForm, cost: event.target.value })} />
            </div>
            <div>
              <label className="text-xs uppercase text-steel">Preço de venda</label>
              <Input value={skuForm.price} onChange={(event) => setSkuForm({ ...skuForm, price: event.target.value })} placeholder="Opcional" />
            </div>
            <div>
              <label className="text-xs uppercase text-steel">Estoque atual</label>
              <Input
                type="number"
                min={0}
                step={1}
                value={skuForm.stock_current}
                onChange={(event) => setSkuForm({ ...skuForm, stock_current: event.target.value })}
              />
            </div>
            <div>
              <label className="text-xs uppercase text-steel">Estoque mínimo</label>
              <Input value={skuForm.stock_min} onChange={(event) => setSkuForm({ ...skuForm, stock_min: event.target.value })} />
            </div>
            <div>
              <label className="text-xs uppercase text-steel">Status</label>
              <select className="input" value={skuForm.status} onChange={(event) => setSkuForm({ ...skuForm, status: event.target.value })}>
                <option value="ATIVO">ATIVO</option>
                <option value="INATIVO">INATIVO</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-steel">
            Alterar o estoque atual gera automaticamente uma movimentação de ajuste para manter o histórico.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setSkuModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveSku} disabled={!canManageCatalog}>
              Salvar
            </Button>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}
