import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { usePdvCart } from "../../lib/pdvCart";
import { supabase } from "../../lib/supabaseClient";

type CustomerRow = {
  id: string;
  full_name: string;
  social_name: string | null;
  phone: string | null;
  city: string | null;
};

type NewCustomerForm = {
  full_name: string;
  social_name: string;
  phone: string;
  city: string;
  notes: string;
};

const emptyForm: NewCustomerForm = {
  full_name: "",
  social_name: "",
  phone: "",
  city: "",
  notes: "",
};

export function CustomerSelector() {
  const { cart, setCustomer } = usePdvCart();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerRow[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<NewCustomerForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setShowDropdown(false);
      return;
    }
    const timeout = setTimeout(async () => {
      const { data } = await supabase
        .from("customers")
        .select("id, full_name, social_name, phone, city")
        .or(`full_name.ilike.%${query}%,phone.ilike.%${query}%`)
        .eq("status", "ATIVO")
        .limit(8);
      setResults(data ?? []);
      setShowDropdown(true);
    }, 250);
    return () => clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selectCustomer = (c: CustomerRow) => {
    setCustomer(c.id, c.full_name);
    setQuery("");
    setResults([]);
    setShowDropdown(false);
  };

  const clearCustomer = () => {
    setCustomer(null, null);
    setQuery("");
  };

  const saveNewCustomer = async () => {
    if (!form.full_name.trim()) {
      setFormError("Nome completo é obrigatório.");
      return;
    }
    setSaving(true);
    setFormError(null);
    const { data, error } = await supabase
      .from("customers")
      .insert({
        full_name: form.full_name.trim(),
        social_name: form.social_name.trim() || null,
        phone: form.phone.trim() || null,
        city: form.city.trim() || null,
        notes: form.notes.trim() || null,
      })
      .select("id, full_name")
      .single();
    setSaving(false);
    if (error) {
      setFormError("Não foi possível cadastrar o cliente.");
      return;
    }
    if (data) {
      setCustomer(data.id, data.full_name);
    }
    setForm(emptyForm);
    setShowModal(false);
  };

  return (
    <div className="rounded-2xl border border-black/10 p-4">
      <p className="text-xs uppercase text-steel">Cliente</p>

      {cart.customerId ? (
        <div className="mt-2 flex items-center gap-3">
          <span className="rounded-2xl bg-lime/20 px-3 py-1 text-sm font-semibold text-ink">
            {cart.customerName}
          </span>
          <Button variant="ghost" onClick={clearCustomer} className="text-xs">
            Limpar
          </Button>
        </div>
      ) : (
        <div ref={containerRef} className="relative mt-2">
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome ou telefone..."
              className="flex-1"
            />
            <Button variant="outline" onClick={() => { setShowModal(true); setForm(emptyForm); setFormError(null); }}>
              + Cadastrar
            </Button>
          </div>
          {showDropdown && results.length > 0 && (
            <div className="absolute z-20 mt-1 w-full rounded-2xl border border-black/10 bg-white shadow-soft">
              {results.map((c) => (
                <button
                  key={c.id}
                  className="flex w-full flex-col px-4 py-3 text-left hover:bg-black/5 first:rounded-t-2xl last:rounded-b-2xl"
                  onClick={() => selectCustomer(c)}
                >
                  <span className="text-sm font-semibold">{c.full_name}</span>
                  <span className="text-xs text-steel">
                    {[c.social_name, c.phone, c.city].filter(Boolean).join(" · ")}
                  </span>
                </button>
              ))}
            </div>
          )}
          {showDropdown && query.trim().length >= 2 && results.length === 0 && (
            <div className="absolute z-20 mt-1 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 shadow-soft">
              <p className="text-sm text-steel">Nenhum cliente encontrado.</p>
            </div>
          )}
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)}>
        <div className="space-y-3">
          <p className="text-lg font-semibold">Cadastrar cliente</p>
          {formError && <p className="text-sm text-ember">{formError}</p>}
          <div>
            <label className="text-xs uppercase text-steel">Nome completo *</label>
            <Input value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs uppercase text-steel">Nome social</label>
            <Input value={form.social_name} onChange={(e) => setForm((f) => ({ ...f, social_name: e.target.value }))} placeholder="Opcional" />
          </div>
          <div>
            <label className="text-xs uppercase text-steel">Telefone / WhatsApp</label>
            <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="Opcional" />
          </div>
          <div>
            <label className="text-xs uppercase text-steel">Cidade</label>
            <Input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} placeholder="Opcional" />
          </div>
          <div>
            <label className="text-xs uppercase text-steel">Observações</label>
            <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Opcional" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button onClick={saveNewCustomer} disabled={saving}>{saving ? "Salvando..." : "Cadastrar"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
