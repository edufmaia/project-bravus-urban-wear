import { useState } from "react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { supabase } from "../../lib/supabaseClient";
import { formatCurrency } from "../../lib/utils";

type ReturnableItem = {
  sale_item_id: string;
  sku_id: string;
  sku: string;
  product_name: string;
  quantity: number;
  unit_price: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  saleId: string;
  saleNumber: number;
  items: ReturnableItem[];
  onSuccess: () => void;
};

export function ReturnModal({ open, onClose, saleId, saleNumber, items, onSuccess }: Props) {
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getQty = (saleItemId: string) => {
    const val = Number(quantities[saleItemId] || "0");
    return Number.isFinite(val) ? Math.max(0, Math.floor(val)) : 0;
  };

  const totalReturn = items.reduce((sum, item) => {
    return sum + getQty(item.sale_item_id) * item.unit_price;
  }, 0);

  const selectedItems = items.filter((item) => getQty(item.sale_item_id) > 0);

  const handleSubmit = async () => {
    if (selectedItems.length === 0) {
      setError("Selecione ao menos um item para devolver.");
      return;
    }
    for (const item of selectedItems) {
      const qty = getQty(item.sale_item_id);
      if (qty > item.quantity) {
        setError(`Quantidade maior que a vendida para ${item.sku}.`);
        return;
      }
    }
    setError(null);
    setSubmitting(true);
    const { error: rpcError } = await supabase.rpc("process_sale_return", {
      payload: {
        sale_id: saleId,
        reason: reason.trim() || null,
        notes: notes.trim() || null,
        items: selectedItems.map((item) => ({
          sale_item_id: item.sale_item_id,
          sku_id: item.sku_id,
          quantity: getQty(item.sale_item_id),
          unit_price: item.unit_price,
        })),
      },
    });
    setSubmitting(false);
    if (rpcError) {
      setError(rpcError.message || "Não foi possível processar a devolução.");
      return;
    }
    setQuantities({});
    setReason("");
    setNotes("");
    onSuccess();
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-lg font-semibold">Devolução — Venda #{saleNumber}</p>
        {error && <p className="text-sm text-ember">{error}</p>}

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-steel">
              <tr>
                <th className="pb-2 text-left">SKU</th>
                <th className="pb-2 text-left">Produto</th>
                <th className="pb-2 text-right">Qtd. vendida</th>
                <th className="pb-2 text-right">Qtd. devolver</th>
                <th className="pb-2 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {items.map((item) => {
                const qty = getQty(item.sale_item_id);
                return (
                  <tr key={item.sale_item_id}>
                    <td className="py-2 font-semibold">{item.sku}</td>
                    <td className="py-2 text-steel">{item.product_name}</td>
                    <td className="py-2 text-right">{item.quantity}</td>
                    <td className="py-2 text-right">
                      <Input
                        className="w-20 text-right"
                        value={quantities[item.sale_item_id] ?? ""}
                        onChange={(e) =>
                          setQuantities((prev) => ({ ...prev, [item.sale_item_id]: e.target.value }))
                        }
                        placeholder="0"
                      />
                    </td>
                    <td className="py-2 text-right">
                      {qty > 0 ? formatCurrency(qty * item.unit_price) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="text-right text-sm font-semibold">
          Total a devolver: {formatCurrency(totalReturn)}
        </div>

        <div>
          <label className="text-xs uppercase text-steel">Motivo</label>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Opcional"
          />
        </div>
        <div>
          <label className="text-xs uppercase text-steel">Observações</label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Opcional"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Processando..." : "Confirmar devolução"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
