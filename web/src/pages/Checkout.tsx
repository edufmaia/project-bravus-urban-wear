import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { usePdvCart } from "../lib/pdvCart";
import { supabase } from "../lib/supabaseClient";
import { formatCurrency, safeParseNumber } from "../lib/utils";

type PaymentMethod = {
  id: string;
  code: string;
  name: string;
  type: "CASH" | "CARD_CREDIT" | "CARD_DEBIT" | "PIX" | "OTHER";
  active: boolean;
};

type CardBrand = {
  id: string;
  code: string;
  name: string;
  active: boolean;
};

type PaymentLine = {
  id: string;
  payment_method_id: string;
  card_brand_id: string;
  amount: string;
  installments: string;
  authorization_code: string;
  notes: string;
};

const createPaymentLine = (): PaymentLine => ({
  id: crypto.randomUUID(),
  payment_method_id: "",
  card_brand_id: "",
  amount: "",
  installments: "1",
  authorization_code: "",
  notes: "",
});

const normalizeMoney = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
};

export function Checkout() {
  const navigate = useNavigate();
  const { cart, totals, clearCart, setDiscount, setNotes } = usePdvCart();
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [cardBrands, setCardBrands] = useState<CardBrand[]>([]);
  const [payments, setPayments] = useState<PaymentLine[]>([createPaymentLine()]);
  const [loadingData, setLoadingData] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setLoadingData(true);
      const [{ data: methods, error: methodsError }, { data: brands, error: brandsError }] = await Promise.all([
        supabase.from("payment_methods").select("id, code, name, type, active").eq("active", true).order("name"),
        supabase.from("card_brands").select("id, code, name, active").eq("active", true).order("name"),
      ]);
      setLoadingData(false);
      if (methodsError || brandsError) {
        setError("Não foi possível carregar métodos de pagamento.");
        return;
      }
      setPaymentMethods((methods ?? []) as PaymentMethod[]);
      setCardBrands((brands ?? []) as CardBrand[]);
      if ((methods ?? []).length > 0) {
        setPayments((current) =>
          current.map((line, index) => (index === 0 ? { ...line, payment_method_id: methods![0].id } : line))
        );
      }
    };
    loadData();
  }, []);

  const methodMap = useMemo(() => new Map(paymentMethods.map((method) => [method.id, method])), [paymentMethods]);

  const paymentTotals = useMemo(() => {
    const normalized = payments.map((line) => {
      const method = methodMap.get(line.payment_method_id);
      const amount = normalizeMoney(safeParseNumber(line.amount));
      return {
        ...line,
        amount,
        method,
      };
    });
    const totalPaid = normalizeMoney(normalized.reduce((sum, line) => sum + line.amount, 0));
    const cashPaid = normalized
      .filter((line) => line.method?.type === "CASH")
      .reduce((sum, line) => sum + line.amount, 0);
    const normalizedCashPaid = normalizeMoney(cashPaid);
    const nonCashPaid = normalizeMoney(totalPaid - normalizedCashPaid);
    const remainingAfterNonCash = normalizeMoney(Math.max(totals.total - nonCashPaid, 0));
    const change = normalizeMoney(Math.max(normalizedCashPaid - remainingAfterNonCash, 0));
    const amountDue = normalizeMoney(Math.max(totals.total - totalPaid, 0));
    const nonCashOverpay = normalizeMoney(Math.max(nonCashPaid - totals.total, 0));
    return {
      totalPaid,
      cashPaid: normalizedCashPaid,
      nonCashPaid,
      change,
      amountDue,
      nonCashOverpay,
      normalized,
    };
  }, [payments, methodMap, totals.total]);

  const updatePayment = (lineId: string, patch: Partial<PaymentLine>) => {
    setPayments((current) =>
      current.map((line) => {
        if (line.id !== lineId) return line;
        const next = { ...line, ...patch };
        const nextMethodId = patch.payment_method_id ?? line.payment_method_id;
        const method = methodMap.get(nextMethodId);
        if (method?.type !== "CARD_CREDIT" && method?.type !== "CARD_DEBIT") {
          next.card_brand_id = "";
          next.installments = "1";
        }
        return next;
      })
    );
  };

  const addPaymentLine = () => {
    setPayments((current) => [
      ...current,
      {
        ...createPaymentLine(),
        payment_method_id: paymentMethods[0]?.id ?? "",
      },
    ]);
  };

  const removePaymentLine = (lineId: string) => {
    setPayments((current) => {
      if (current.length === 1) return current;
      return current.filter((line) => line.id !== lineId);
    });
  };

  const validateCheckout = () => {
    if (!cart.items.length) return "Carrinho vazio.";
    if (paymentMethods.length === 0) return "Nenhum método de pagamento ativo.";
    for (const item of cart.items) {
      if (item.quantity > item.stock_current) {
        return `Estoque insuficiente para ${item.sku}.`;
      }
    }
    for (const line of paymentTotals.normalized) {
      if (!line.payment_method_id) return "Selecione o método em todas as linhas de pagamento.";
      if (!line.method) return "Método de pagamento inválido ou inativo.";
      if (line.amount <= 0) return "Todos os pagamentos devem ter valor maior que zero.";
      if ((line.method.type === "CARD_CREDIT" || line.method.type === "CARD_DEBIT") && !line.card_brand_id) {
        return "Bandeira é obrigatória para cartão.";
      }
    }
    if (paymentTotals.amountDue > 0) {
      return "Pagamentos não fecham o total da venda.";
    }
    if (paymentTotals.nonCashOverpay > 0) {
      return "Troco só pode ser gerado por pagamento em dinheiro.";
    }
    return null;
  };

  const finalizeSale = async () => {
    const validationError = validateCheckout();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setSubmitting(true);
    const payload = {
      items: cart.items.map((item) => ({
        sku_id: item.sku_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount_amount: 0,
      })),
      payments: paymentTotals.normalized.map((line) => ({
        payment_method_id: line.payment_method_id,
        card_brand_id: line.card_brand_id || null,
        amount: line.amount,
        installments: Number(line.installments) || 1,
        authorization_code: line.authorization_code || null,
        notes: line.notes || null,
      })),
      discount_total: totals.discountAmount,
      surcharge_total: 0,
      notes: cart.notes || null,
    };
    const { data, error: rpcError } = await supabase.rpc("finalize_sale", { payload });
    setSubmitting(false);
    if (rpcError) {
      setError(rpcError.message || "Não foi possível finalizar a venda.");
      return;
    }
    const result = data as { sale_id?: string; number?: number } | null;
    if (!result?.sale_id) {
      setError("Venda finalizada sem retorno de sale_id.");
      return;
    }
    clearCart();
    navigate(`/vendas/${result.sale_id}`, { replace: true });
  };

  if (cart.items.length === 0) {
    return (
      <AppShell
        title="Checkout"
        actions={
          <Button onClick={() => navigate("/pdv")}>
            Voltar ao PDV
          </Button>
        }
      >
        <Card className="p-6">
          <p className="text-sm text-steel">Carrinho vazio. Adicione itens no PDV para continuar.</p>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Checkout"
      actions={
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => navigate("/pdv")}>
            Voltar ao PDV
          </Button>
          <Button onClick={finalizeSale} disabled={submitting || loadingData}>
            {submitting ? "Finalizando..." : "Finalizar venda"}
          </Button>
        </div>
      }
    >
      {error && <p className="text-sm text-ember">{error}</p>}
      {loadingData && <p className="text-sm text-steel">Carregando métodos de pagamento...</p>}

      <Card className="p-6">
        <p className="text-xs uppercase text-steel">Desconto e observações</p>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div>
            <label className="text-xs uppercase text-steel">Tipo de desconto</label>
            <select
              className="input"
              value={cart.discountType}
              onChange={(event) => setDiscount(event.target.value as "AMOUNT" | "PERCENT", cart.discountValue)}
            >
              <option value="AMOUNT">R$</option>
              <option value="PERCENT">%</option>
            </select>
          </div>
          <div>
            <label className="text-xs uppercase text-steel">Valor do desconto</label>
            <Input
              value={cart.discountValue}
              onChange={(event) => setDiscount(cart.discountType, safeParseNumber(event.target.value))}
            />
          </div>
          <div>
            <label className="text-xs uppercase text-steel">Observações</label>
            <Input value={cart.notes} onChange={(event) => setNotes(event.target.value)} placeholder="Opcional" />
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase text-steel">Pagamentos</p>
            <p className="text-lg font-semibold">Lançamentos de pagamento</p>
          </div>
          <Button variant="outline" onClick={addPaymentLine} disabled={loadingData}>
            + Pagamento
          </Button>
        </div>
        <div className="mt-4 space-y-4">
          {payments.map((line) => {
            const method = methodMap.get(line.payment_method_id);
            const isCard = method?.type === "CARD_CREDIT" || method?.type === "CARD_DEBIT";
            return (
              <div key={line.id} className="rounded-2xl border border-black/10 p-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <label className="text-xs uppercase text-steel">Método</label>
                    <select
                      className="input"
                      value={line.payment_method_id}
                      onChange={(event) => updatePayment(line.id, { payment_method_id: event.target.value })}
                    >
                      <option value="">Selecione</option>
                      {paymentMethods.map((paymentMethod) => (
                        <option key={paymentMethod.id} value={paymentMethod.id}>
                          {paymentMethod.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs uppercase text-steel">Bandeira</label>
                    <select
                      className="input"
                      value={line.card_brand_id}
                      onChange={(event) => updatePayment(line.id, { card_brand_id: event.target.value })}
                      disabled={!isCard}
                    >
                      <option value="">{isCard ? "Selecione" : "N/A"}</option>
                      {cardBrands.map((brand) => (
                        <option key={brand.id} value={brand.id}>
                          {brand.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs uppercase text-steel">Valor pago</label>
                    <Input
                      value={line.amount}
                      onChange={(event) => updatePayment(line.id, { amount: event.target.value })}
                      placeholder="0,00"
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase text-steel">Parcelas</label>
                    <Input
                      value={line.installments}
                      onChange={(event) => updatePayment(line.id, { installments: event.target.value })}
                      disabled={!isCard}
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase text-steel">Autorização</label>
                    <Input
                      value={line.authorization_code}
                      onChange={(event) => updatePayment(line.id, { authorization_code: event.target.value })}
                      placeholder="Opcional"
                    />
                  </div>
                  <div className="flex items-end justify-end">
                    <Button variant="ghost" onClick={() => removePaymentLine(line.id)}>
                      Remover linha
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-6">
        <p className="text-xs uppercase text-steel">Resumo financeiro</p>
        <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
          <p>Subtotal: <strong>{formatCurrency(totals.subtotal)}</strong></p>
          <p>Desconto total: <strong>{formatCurrency(totals.discountAmount)}</strong></p>
          <p>Total da venda: <strong>{formatCurrency(totals.total)}</strong></p>
          <p>Pago: <strong>{formatCurrency(paymentTotals.totalPaid)}</strong></p>
          <p>Falta pagar: <strong>{formatCurrency(paymentTotals.amountDue)}</strong></p>
          <p>Troco (somente dinheiro): <strong>{formatCurrency(paymentTotals.change)}</strong></p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge tone={paymentTotals.amountDue > 0 ? "warning" : "success"}>
            {paymentTotals.amountDue > 0 ? "Pagamentos pendentes" : "Pagamentos fechados"}
          </Badge>
          {paymentTotals.nonCashOverpay > 0 && (
            <Badge tone="danger">Excesso em meios não-dinheiro</Badge>
          )}
        </div>
      </Card>
    </AppShell>
  );
}
