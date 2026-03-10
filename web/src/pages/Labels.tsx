import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../components/layout/AppShell";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { LabelSheet } from "../components/labels/LabelSheet";
import { useAuth } from "../lib/auth";
import {
  clampCopies,
  expandLabels,
  type LabelPrintPayload,
  LABEL_PRINT_STORAGE_PREFIX,
  type LabelSkuItem,
  LABEL_TEMPLATES,
  type LabelTemplateId,
  sanitizePayload,
} from "../lib/labels";
import { supabase } from "../lib/supabaseClient";
import { formatDate } from "../lib/utils";

type ProductRelation = {
  id: string | null;
  code: string | null;
  name: string | null;
  category: string | null;
};

type ProductSkuSearchRow = {
  id: string;
  product_id: string | null;
  sku: string | null;
  color: string | null;
  size: string | null;
  status: string | null;
  products: ProductRelation | ProductRelation[] | null;
};

type SearchResultRow = Omit<LabelSkuItem, "copies"> & {
  status: string;
};

type LabelPrintJobRow = {
  job_id: string;
  created_by: string | null;
  created_at: string;
  payload: unknown;
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function getPayloadLabelCount(payload: unknown) {
  if (!payload || typeof payload !== "object") return 0;
  const candidate = payload as Record<string, unknown>;
  if (!Array.isArray(candidate.items)) return 0;
  return candidate.items.reduce((sum, item) => {
    if (!item || typeof item !== "object") return sum;
    const row = item as Record<string, unknown>;
    const copies = Number(row.copies) || 0;
    return sum + Math.max(0, copies);
  }, 0);
}

function getPayloadTemplateName(payload: unknown) {
  if (!payload || typeof payload !== "object") return "-";
  const candidate = payload as Record<string, unknown>;
  const templateId = candidate.template_id;
  if (typeof templateId !== "string") return "-";
  const template = LABEL_TEMPLATES.find((row) => row.id === templateId);
  return template?.name ?? templateId;
}

export function Labels() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResultRow[]>([]);
  const [selectedItems, setSelectedItems] = useState<LabelSkuItem[]>([]);
  const [templateId, setTemplateId] = useState<LabelTemplateId>("40x30");
  const [showPreview, setShowPreview] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRows, setHistoryRows] = useState<LabelPrintJobRow[]>([]);
  const [historyDisabledReason, setHistoryDisabledReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [productSequenceById, setProductSequenceById] = useState<Record<string, number>>({});
  const searchTerm = query.trim();

  const loadHistory = async () => {
    setHistoryLoading(true);
    const { data, error: loadError } = await supabase
      .from("label_print_jobs")
      .select("job_id, created_by, created_at, payload")
      .order("created_at", { ascending: false })
      .limit(20);
    setHistoryLoading(false);

    if (loadError) {
      if (loadError.code === "42P01") {
        setHistoryDisabledReason("Tabela label_print_jobs ainda nao aplicada no banco.");
        setHistoryRows([]);
        return;
      }
      setHistoryDisabledReason(`Historico indisponivel: ${loadError.message}`);
      setHistoryRows([]);
      return;
    }
    setHistoryDisabledReason(null);
    setHistoryRows((data ?? []) as LabelPrintJobRow[]);
  };

  const loadProductSequence = async () => {
    const { data, error: loadError } = await supabase
      .from("products")
      .select("id, created_at")
      .order("created_at", { ascending: true });
    if (loadError) return;
    const map: Record<string, number> = {};
    (data ?? []).forEach((row, index) => {
      map[row.id] = index + 1;
    });
    setProductSequenceById(map);
  };

  useEffect(() => {
    void Promise.resolve().then(() => {
      loadHistory();
      loadProductSequence();
    });
  }, []);

  useEffect(() => {
    if (!searchTerm) return;

    let active = true;
    const timeout = setTimeout(async () => {
      setSearchLoading(true);
      const { data, error: searchError } = await supabase
        .from("product_skus")
        .select("id, product_id, sku, color, size, status, products(id, name, code, category)")
        .eq("status", "ATIVO")
        .order("created_at", { ascending: false })
        .limit(300);
      if (!active) return;
      setSearchLoading(false);

      if (searchError) {
        setError("Nao foi possivel pesquisar SKUs.");
        setSearchResults([]);
        return;
      }

      const normalizedTerm = searchTerm.toLowerCase();
      const rows = ((data ?? []) as ProductSkuSearchRow[])
        .map((row) => {
          const product = firstRelation(row.products);
          const productSequence =
            (row.product_id ? productSequenceById[row.product_id] : undefined) ??
            (product?.id ? productSequenceById[product.id] : undefined) ??
            0;
          return {
            sku_id: row.id,
            sku: row.sku ?? "",
            product_code: product?.code ?? "",
            product_name: product?.name ?? "",
            category: product?.category ?? "",
            color: row.color ?? "",
            size: row.size ?? "",
            product_sequence: productSequence,
            status: row.status ?? "ATIVO",
          };
        })
        .filter((row) => {
          const haystack = `${row.sku} ${row.product_code} ${row.product_name}`.toLowerCase();
          return haystack.includes(normalizedTerm);
        })
        .slice(0, 20);

      setError(null);
      setSearchResults(rows);
    }, 250);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [searchTerm, productSequenceById]);

  const totalCopies = useMemo(
    () => selectedItems.reduce((sum, item) => sum + clampCopies(item.copies), 0),
    [selectedItems]
  );
  const visibleSearchResults = useMemo(
    () => (searchTerm ? searchResults : []),
    [searchTerm, searchResults]
  );
  const expandedLabels = useMemo(() => expandLabels(selectedItems), [selectedItems]);
  const previewLabels = useMemo(() => expandedLabels.slice(0, 60), [expandedLabels]);

  const addItem = (row: SearchResultRow) => {
    setSelectedItems((current) => {
      const existing = current.find((item) => item.sku_id === row.sku_id);
      if (!existing) {
        return [
          ...current,
          {
            sku_id: row.sku_id,
            sku: row.sku,
            product_code: row.product_code,
            product_name: row.product_name,
            category: row.category,
            color: row.color,
            size: row.size,
            product_sequence: row.product_sequence,
            copies: 1,
          },
        ];
      }
      return current.map((item) =>
        item.sku_id === row.sku_id
          ? {
              ...item,
              copies: clampCopies(item.copies + 1),
            }
          : item
      );
    });
    setShowPreview(false);
  };

  const updateCopies = (skuId: string, value: number) => {
    setSelectedItems((current) =>
      current.map((item) =>
        item.sku_id === skuId
          ? {
              ...item,
              copies: clampCopies(value),
            }
          : item
      )
    );
    setShowPreview(false);
  };

  const removeItem = (skuId: string) => {
    setSelectedItems((current) => current.filter((item) => item.sku_id !== skuId));
    setShowPreview(false);
  };

  const buildPayload = (): LabelPrintPayload => {
    const items = selectedItems
      .map((item) => ({
        ...item,
        copies: clampCopies(item.copies),
      }))
      .filter((item) => item.copies > 0);
    return sanitizePayload({
      template_id: templateId,
      generated_at: new Date().toISOString(),
      items,
    });
  };

  const handlePreview = () => {
    if (!selectedItems.length) {
      setError("Adicione ao menos um SKU.");
      return;
    }
    if (totalCopies <= 0) {
      setError("Quantidade de etiquetas invalida.");
      return;
    }
    setError(null);
    setShowPreview(true);
  };

  const handlePrint = async () => {
    if (!selectedItems.length || totalCopies <= 0) {
      setError("Adicione SKUs e quantidades validas antes de imprimir.");
      return;
    }

    const popup = window.open("", "_blank");
    if (!popup) {
      setError("Nao foi possivel abrir a janela de impressao. Libere popups para este site.");
      return;
    }

    setPrinting(true);
    setError(null);
    setWarning(null);
    const payload = buildPayload();
    const jobId = crypto.randomUUID();
    localStorage.setItem(`${LABEL_PRINT_STORAGE_PREFIX}${jobId}`, JSON.stringify(payload));

    const { error: insertError } = await supabase.from("label_print_jobs").insert({
      job_id: jobId,
      created_by: user?.id ?? null,
      payload,
    });

    if (insertError) {
      if (insertError.code === "42P01") {
        setWarning("Tabela label_print_jobs nao encontrada. Impressao segue sem historico.");
      } else if (insertError.code === "42501") {
        setWarning("Sem permissao para gravar historico. Impressao segue normalmente.");
      } else {
        setWarning(`Falha ao gravar historico: ${insertError.message}`);
      }
    } else {
      await loadHistory();
    }

    popup.location.href = `/labels/print?job_id=${encodeURIComponent(jobId)}&autoprint=1`;
    setPrinting(false);
  };

  return (
    <AppShell
      title="Etiquetas"
      actions={
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={handlePreview} disabled={!selectedItems.length}>
            Pre-visualizar
          </Button>
          <Button onClick={handlePrint} disabled={!selectedItems.length || printing}>
            {printing ? "Preparando impressao..." : "Imprimir"}
          </Button>
        </div>
      }
    >
      {error && <p className="text-sm text-ember">{error}</p>}
      {warning && <p className="text-sm text-amber-700">{warning}</p>}

      <Card className="p-6">
        <p className="text-xs uppercase text-steel">Buscar SKU</p>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ex.: TSH-001-BLK-M ou nome do produto"
          />
          <Badge tone="neutral">{visibleSearchResults.length} resultados</Badge>
        </div>
        {searchLoading && <p className="mt-3 text-sm text-steel">Buscando...</p>}
        {searchTerm && !searchLoading && visibleSearchResults.length === 0 && (
          <p className="mt-3 text-sm text-steel">Nenhum SKU encontrado.</p>
        )}
        {visibleSearchResults.length > 0 && (
          <div className="mt-4 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-steel">
                <tr>
                  <th className="py-2">SKU</th>
                  <th>Produto</th>
                  <th>Variacao</th>
                  <th>Status</th>
                  <th>Acao</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {visibleSearchResults.map((row) => (
                  <tr key={row.sku_id}>
                    <td className="py-3 font-semibold">{row.sku}</td>
                    <td>{row.product_name}</td>
                    <td>{row.color}/{row.size}</td>
                    <td>
                      <Badge tone={row.status === "ATIVO" ? "success" : "warning"}>{row.status}</Badge>
                    </td>
                    <td>
                      <Button variant="outline" onClick={() => addItem(row)}>
                        Adicionar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase text-steel">Itens selecionados</p>
            <p className="text-lg font-semibold">{totalCopies} etiquetas</p>
          </div>
          <Button variant="ghost" onClick={() => setSelectedItems([])} disabled={!selectedItems.length}>
            Limpar
          </Button>
        </div>
        <div className="mt-4 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-steel">
              <tr>
                <th className="py-2">SKU</th>
                <th>Produto</th>
                <th>Variacao</th>
                <th>Qtd etiquetas</th>
                <th>Acao</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {selectedItems.map((item) => (
                <tr key={item.sku_id}>
                  <td className="py-3 font-semibold">{item.sku}</td>
                  <td>{item.product_name}</td>
                  <td>{item.color}/{item.size}</td>
                  <td>
                    <Input
                      className="w-24"
                      type="number"
                      min={1}
                      max={500}
                      value={item.copies}
                      onChange={(event) => updateCopies(item.sku_id, Number(event.target.value))}
                    />
                  </td>
                  <td>
                    <Button variant="ghost" onClick={() => removeItem(item.sku_id)}>
                      Remover
                    </Button>
                  </td>
                </tr>
              ))}
              {selectedItems.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-steel">
                    Nenhum SKU selecionado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-6">
        <p className="text-xs uppercase text-steel">Template de impressao</p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {LABEL_TEMPLATES.map((template) => (
            <button
              key={template.id}
              onClick={() => {
                setTemplateId(template.id);
                setShowPreview(false);
              }}
              className={`rounded-2xl border p-4 text-left transition ${
                templateId === template.id
                  ? "border-ink bg-ink text-white"
                  : "border-black/10 bg-white hover:border-ink/40"
              }`}
            >
              <p className="text-sm font-semibold">{template.name}</p>
              <p className={`text-xs ${templateId === template.id ? "text-white/80" : "text-steel"}`}>
                {template.description}
              </p>
            </button>
          ))}
        </div>
      </Card>

      {showPreview && (
        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase text-steel">Pre-visualizacao</p>
              <p className="text-sm text-steel">
                Mostrando {previewLabels.length} de {expandedLabels.length} etiquetas
              </p>
            </div>
            {expandedLabels.length > previewLabels.length && (
              <Badge tone="warning">Preview limitada a 60 etiquetas</Badge>
            )}
          </div>
          <div className="mt-4 overflow-auto rounded-2xl border border-black/10 bg-white">
            <LabelSheet templateId={templateId} labels={previewLabels} />
          </div>
        </Card>
      )}

      <Card className="p-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs uppercase text-steel">Historico de impressao</p>
          {historyLoading && <span className="text-xs text-steel">Carregando...</span>}
        </div>
        {historyDisabledReason ? (
          <p className="mt-3 text-sm text-steel">{historyDisabledReason}</p>
        ) : (
          <div className="mt-4 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-steel">
                <tr>
                  <th className="py-2">Job</th>
                  <th>Data</th>
                  <th>Template</th>
                  <th>Etiquetas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {historyRows.map((row) => (
                  <tr key={row.job_id}>
                    <td className="py-3 font-mono text-xs">{row.job_id}</td>
                    <td>{formatDate(row.created_at)}</td>
                    <td>{getPayloadTemplateName(row.payload)}</td>
                    <td>{getPayloadLabelCount(row.payload)}</td>
                  </tr>
                ))}
                {historyRows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-steel">
                      Nenhum job registrado.
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
