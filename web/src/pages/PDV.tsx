import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { formatCurrency } from "../lib/utils";
import { supabase } from "../lib/supabaseClient";
import { usePdvCart } from "../lib/pdvCart";
import { CustomerSelector } from "../components/pdv/CustomerSelector";

type SearchResultRow = {
  sku_id: string;
  sku: string;
  product_code: string;
  product_name: string;
  color: string;
  size: string;
  price: number | null;
  stock_current: number;
  status: string;
};

type ProductRelation = {
  code: string | null;
  name: string | null;
};

type ProductSkuQueryRow = {
  id: string;
  sku: string | null;
  color: string | null;
  size: string | null;
  price: number | null;
  stock_current: number | null;
  status: string | null;
  products: ProductRelation | ProductRelation[] | null;
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

const editableTags = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export function PDV() {
  const navigate = useNavigate();
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const { cart, totals, addItem, updateQuantity, removeItem, clearCart } = usePdvCart();
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResultRow[]>([]);
  const [selectedSearch, setSelectedSearch] = useState(0);
  const [selectedCartSkuId, setSelectedCartSkuId] = useState<string | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [loadingAction, setLoadingAction] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchTerm = query.trim();

  useEffect(() => {
    if (!searchTerm) {
      setSearchResults([]);
      setSelectedSearch(0);
      return;
    }
    let active = true;
    const timeout = setTimeout(async () => {
      setSearchLoading(true);
      const { data, error: searchError } = await supabase
        .from("product_skus")
        .select("id, sku, color, size, price, stock_current, status, products(name, code)")
        .order("created_at", { ascending: false })
        .limit(300);
      if (!active) return;
      setSearchLoading(false);
      if (searchError) {
        setError("Não foi possível pesquisar SKUs.");
        setSearchResults([]);
        return;
      }
      setError(null);
      const normalizedTerm = searchTerm.toLowerCase();
      const filtered = ((data ?? []) as ProductSkuQueryRow[])
        .map((row) => {
          const product = firstRelation(row.products);
          return {
            sku_id: row.id,
            sku: row.sku ?? "",
            product_code: product?.code ?? "",
            product_name: product?.name ?? "",
            color: row.color ?? "",
            size: row.size ?? "",
            price: row.price,
            stock_current: Number(row.stock_current) || 0,
            status: row.status ?? "ATIVO",
          };
        })
        .filter((row) => {
          const haystack = `${row.sku} ${row.product_code} ${row.product_name}`.toLowerCase();
          return haystack.includes(normalizedTerm);
        })
        .slice(0, 20);
      setSearchResults(filtered);
      setSelectedSearch(0);
    }, 250);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [searchTerm]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete" || !selectedCartSkuId) return;
      const target = event.target as HTMLElement | null;
      if (target && editableTags.has(target.tagName)) return;
      removeItem(selectedCartSkuId);
      setSelectedCartSkuId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [selectedCartSkuId, removeItem]);

  const clampQuantity = (skuId: string, desired: number) => {
    const item = cart.items.find((row) => row.sku_id === skuId);
    if (!item) return;
    const next = Math.max(1, Math.floor(desired) || 1);
    if (next > item.stock_current) {
      setError(`Quantidade acima do estoque disponível para ${item.sku}.`);
      updateQuantity(skuId, item.stock_current);
      return;
    }
    setError(null);
    updateQuantity(skuId, next);
  };

  const addSkuToCart = async (row?: SearchResultRow) => {
    const candidate = row ?? searchResults[selectedSearch] ?? null;
    if (!candidate) return;
    setLoadingAction(true);
    setError(null);
    try {
      if (candidate.status !== "ATIVO") {
        setError("Este SKU está inativo.");
        return;
      }
      if (candidate.price === null || candidate.price === undefined) {
        setError("Este SKU está sem preço de venda.");
        return;
      }
      const existing = cart.items.find((item) => item.sku_id === candidate.sku_id);
      const nextQuantity = existing ? existing.quantity + 1 : 1;
      if (nextQuantity > candidate.stock_current) {
        setError(`Estoque insuficiente para ${candidate.sku}.`);
        return;
      }
      addItem({
        sku_id: candidate.sku_id,
        sku: candidate.sku,
        product_code: candidate.product_code,
        product_name: candidate.product_name,
        color: candidate.color,
        size: candidate.size,
        unit_price: Number(candidate.price),
        stock_current: Number(candidate.stock_current) || 0,
      });
      setSelectedCartSkuId(candidate.sku_id);
      setQuery("");
      setSearchResults([]);
      searchInputRef.current?.focus();
    } finally {
      setLoadingAction(false);
    }
  };

  const onSearchInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addSkuToCart();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setQuery("");
      setSearchResults([]);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!searchResults.length) return;
      setSelectedSearch((prev) => Math.min(prev + 1, searchResults.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!searchResults.length) return;
      setSelectedSearch((prev) => Math.max(prev - 1, 0));
    }
  };

  const selectedItem = useMemo(
    () => cart.items.find((item) => item.sku_id === selectedCartSkuId) ?? null,
    [cart.items, selectedCartSkuId]
  );

  return (
    <AppShell
      title="PDV"
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={clearCart} disabled={!cart.items.length}>
            Limpar carrinho
          </Button>
          {cart.items.length > 0 && !cart.customerId && (
            <p className="text-sm text-ember">Selecione um cliente para continuar.</p>
          )}
          <Button
            onClick={() => navigate("/checkout")}
            disabled={!cart.items.length || !cart.customerId}
          >
            Ir para checkout
          </Button>
        </div>
      }
    >
      {error && <p className="text-sm text-ember">{error}</p>}
      <CustomerSelector />
      <Card className="p-6">
        <p className="text-xs uppercase text-steel">Buscar SKU / código / produto</p>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
          <Input
            ref={searchInputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onSearchInputKeyDown}
            placeholder="Ex.: TSH-001-BLK-M, TSH-001 ou Camiseta"
          />
          <Button onClick={() => addSkuToCart()} disabled={!searchResults.length || loadingAction}>
            Adicionar
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <Badge tone="neutral">Enter: adicionar</Badge>
          <Badge tone="neutral">Esc: limpar busca</Badge>
          <Badge tone="neutral">Del: remover item selecionado</Badge>
        </div>
        {searchLoading && <p className="mt-3 text-sm text-steel">Pesquisando...</p>}
        {!searchLoading && searchTerm && searchResults.length === 0 && (
          <p className="mt-3 text-sm text-steel">Nenhum SKU encontrado.</p>
        )}
        {searchResults.length > 0 && (
          <div className="mt-4 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-steel">
                <tr>
                  <th className="py-2">SKU</th>
                  <th>Produto</th>
                  <th>Variação</th>
                  <th>Preço</th>
                  <th>Estoque</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {searchResults.map((row, index) => (
                  <tr
                    key={row.sku_id}
                    className={index === selectedSearch ? "bg-black/5" : ""}
                    onMouseEnter={() => setSelectedSearch(index)}
                  >
                    <td className="py-3 font-semibold">{row.sku}</td>
                    <td>{row.product_name}</td>
                    <td>{row.color}/{row.size}</td>
                    <td>{row.price === null ? "-" : formatCurrency(Number(row.price))}</td>
                    <td>{row.stock_current}</td>
                    <td>
                      <Button variant="outline" onClick={() => addSkuToCart(row)} disabled={loadingAction}>
                        + Carrinho
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase text-steel">Carrinho</p>
            <p className="text-lg font-semibold">{totals.itemsCount} itens</p>
          </div>
          {selectedItem && (
            <Badge tone="warning">
              Selecionado: {selectedItem.sku}
            </Badge>
          )}
        </div>
        <div className="mt-4 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-steel">
              <tr>
                <th className="py-2">SKU</th>
                <th>Produto</th>
                <th>Preço</th>
                <th>Qtd.</th>
                <th>Total</th>
                <th>Estoque</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {cart.items.map((item) => (
                <tr
                  key={item.sku_id}
                  className={selectedCartSkuId === item.sku_id ? "bg-black/5" : ""}
                  onClick={() => setSelectedCartSkuId(item.sku_id)}
                >
                  <td className="py-3 font-semibold">{item.sku}</td>
                  <td>{item.product_name}</td>
                  <td>{formatCurrency(item.unit_price)}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        className="h-8 w-8 rounded-full p-0"
                        onClick={() => clampQuantity(item.sku_id, item.quantity - 1)}
                      >
                        -
                      </Button>
                      <Input
                        className="w-20 text-center"
                        value={item.quantity}
                        onChange={(event) => clampQuantity(item.sku_id, Number(event.target.value))}
                      />
                      <Button
                        variant="ghost"
                        className="h-8 w-8 rounded-full p-0"
                        onClick={() => clampQuantity(item.sku_id, item.quantity + 1)}
                      >
                        +
                      </Button>
                    </div>
                  </td>
                  <td>{formatCurrency(item.quantity * item.unit_price)}</td>
                  <td>{item.stock_current}</td>
                  <td>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        removeItem(item.sku_id);
                        if (selectedCartSkuId === item.sku_id) setSelectedCartSkuId(null);
                      }}
                    >
                      Remover
                    </Button>
                  </td>
                </tr>
              ))}
              {cart.items.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-steel">
                    Carrinho vazio.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex justify-end">
          <div className="rounded-2xl bg-black/5 px-4 py-3 text-sm">
            <p>Subtotal: <strong>{formatCurrency(totals.subtotal)}</strong></p>
            <p>Total previsto: <strong>{formatCurrency(totals.total)}</strong></p>
          </div>
        </div>
      </Card>
    </AppShell>
  );
}
