import { useEffect, useState } from "react";
import { AppShell } from "../components/layout/AppShell";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth";

type CustomerForm = {
  id: string;
  full_name: string;
  social_name: string;
  phone: string;
  city: string;
  notes: string;
  status: "ATIVO" | "INATIVO";
};

const emptyForm: CustomerForm = {
  id: "",
  full_name: "",
  social_name: "",
  phone: "",
  city: "",
  notes: "",
  status: "ATIVO",
};

export function Customers() {
  const { profile } = useAuth();
  const role = profile?.role ?? "VISUALIZADOR";
  const canWrite = ["ADMIN", "GERENTE", "OPERADOR"].includes(role);

  const [customers, setCustomers] = useState<any[]>([]);
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    const { data, error: queryError } = await supabase
      .from("customers")
      .select("*")
      .order("full_name");
    if (queryError) {
      setError("Não foi possível carregar os clientes.");
      return;
    }
    setCustomers(data ?? []);
  };

  useEffect(() => {
    loadData();
  }, []);

  const resetForm = () => {
    setForm(emptyForm);
    setError(null);
  };

  const editCustomer = (c: any) => {
    setError(null);
    setForm({
      id: c.id ?? "",
      full_name: c.full_name ?? "",
      social_name: c.social_name ?? "",
      phone: c.phone ?? "",
      city: c.city ?? "",
      notes: c.notes ?? "",
      status: c.status === "INATIVO" ? "INATIVO" : "ATIVO",
    });
  };

  const saveCustomer = async () => {
    if (!canWrite) {
      setError("Seu perfil não tem permissão para criar ou editar clientes.");
      return;
    }
    if (!form.full_name.trim()) {
      setError("Informe o nome completo do cliente.");
      return;
    }
    setError(null);
    const payload = {
      full_name: form.full_name.trim(),
      social_name: form.social_name.trim() || null,
      phone: form.phone.trim() || null,
      city: form.city.trim() || null,
      notes: form.notes.trim() || null,
      status: form.status,
    };

    if (form.id) {
      const { error: updateError } = await supabase
        .from("customers")
        .update(payload)
        .eq("id", form.id);
      if (updateError) {
        setError("Erro ao atualizar cliente.");
        return;
      }
    } else {
      const { error: insertError } = await supabase
        .from("customers")
        .insert(payload);
      if (insertError) {
        setError("Erro ao cadastrar cliente.");
        return;
      }
    }
    resetForm();
    loadData();
  };

  const filtered = customers.filter((c) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      (c.full_name ?? "").toLowerCase().includes(s) ||
      (c.phone ?? "").toLowerCase().includes(s) ||
      (c.city ?? "").toLowerCase().includes(s)
    );
  });

  return (
    <AppShell title="Clientes">
      {canWrite && (
        <Card className="p-6">
          <p className="text-xs uppercase text-steel">
            {form.id ? "Editar cliente" : "Novo cliente"}
          </p>
          {error && <p className="mt-2 text-sm text-ember">{error}</p>}
          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="text-xs uppercase text-steel">Nome completo *</label>
              <Input
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs uppercase text-steel">Nome social</label>
              <Input
                value={form.social_name}
                onChange={(e) => setForm((f) => ({ ...f, social_name: e.target.value }))}
                placeholder="Opcional"
              />
            </div>
            <div>
              <label className="text-xs uppercase text-steel">Telefone / WhatsApp</label>
              <Input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="Opcional"
              />
            </div>
            <div>
              <label className="text-xs uppercase text-steel">Cidade</label>
              <Input
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                placeholder="Opcional"
              />
            </div>
            <div>
              <label className="text-xs uppercase text-steel">Observações</label>
              <Input
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Opcional"
              />
            </div>
            <div>
              <label className="text-xs uppercase text-steel">Status</label>
              <select
                className="input"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as "ATIVO" | "INATIVO" }))}
              >
                <option value="ATIVO">Ativo</option>
                <option value="INATIVO">Inativo</option>
              </select>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={saveCustomer}>{form.id ? "Salvar alterações" : "Cadastrar cliente"}</Button>
            {form.id && (
              <Button variant="outline" onClick={resetForm}>Cancelar</Button>
            )}
          </div>
        </Card>
      )}

      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase text-steel">Clientes cadastrados</p>
            <p className="text-lg font-semibold">
              {filtered.length} <Badge>{customers.length} total</Badge>
            </p>
          </div>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, telefone ou cidade..."
            className="w-full md:w-72"
          />
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left text-xs uppercase text-steel">
                <th className="pb-2 pr-4">Nome completo</th>
                <th className="pb-2 pr-4">Nome social</th>
                <th className="pb-2 pr-4">Telefone</th>
                <th className="pb-2 pr-4">Cidade</th>
                <th className="pb-2 pr-4">Status</th>
                {canWrite && <th className="pb-2">Ação</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={canWrite ? 6 : 5} className="py-6 text-center text-steel">
                    Nenhum cliente encontrado.
                  </td>
                </tr>
              )}
              {filtered.map((c) => (
                <tr key={c.id} className="border-b border-black/5 hover:bg-black/2">
                  <td className="py-2 pr-4 font-medium">{c.full_name}</td>
                  <td className="py-2 pr-4 text-steel">{c.social_name || "—"}</td>
                  <td className="py-2 pr-4 text-steel">{c.phone || "—"}</td>
                  <td className="py-2 pr-4 text-steel">{c.city || "—"}</td>
                  <td className="py-2 pr-4">
                    <Badge tone={c.status === "ATIVO" ? "success" : "neutral"}>
                      {c.status}
                    </Badge>
                  </td>
                  {canWrite && (
                    <td className="py-2">
                      <Button variant="ghost" onClick={() => editCustomer(c)}>Editar</Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </AppShell>
  );
}
