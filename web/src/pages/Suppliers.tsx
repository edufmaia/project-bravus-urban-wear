import { useEffect, useState } from "react";
import { AppShell } from "../components/layout/AppShell";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth";

type SupplierForm = {
  id: string;
  name: string;
  email: string;
  phone: string;
  notes: string;
  status: "ATIVO" | "INATIVO";
};

const emptyForm: SupplierForm = {
  id: "",
  name: "",
  email: "",
  phone: "",
  notes: "",
  status: "ATIVO",
};

export function Suppliers() {
  const { profile } = useAuth();
  const role = profile?.role ?? "VISUALIZADOR";
  const canWrite = ["ADMIN", "GERENTE", "OPERADOR"].includes(role);

  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [form, setForm] = useState<SupplierForm>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    const { data, error: queryError } = await supabase.from("suppliers").select("*").order("name");
    if (queryError) {
      setError("Não foi possível carregar os fornecedores.");
      return;
    }
    setSuppliers(data ?? []);
  };

  useEffect(() => {
    loadData();
  }, []);

  const resetForm = () => {
    setForm(emptyForm);
    setError(null);
  };

  const editSupplier = (supplier: any) => {
    setError(null);
    setForm({
      id: supplier.id ?? "",
      name: supplier.name ?? "",
      email: supplier.email ?? "",
      phone: supplier.phone ?? "",
      notes: supplier.notes ?? "",
      status: supplier.status === "INATIVO" ? "INATIVO" : "ATIVO",
    });
  };

  const saveSupplier = async () => {
    if (!canWrite) {
      setError("Seu perfil não tem permissão para criar ou editar fornecedores.");
      return;
    }
    if (!form.name.trim()) {
      setError("Informe o nome do fornecedor.");
      return;
    }
    setError(null);
    const payload = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      notes: form.notes.trim() || null,
      status: form.status,
    };
    const { error: saveError } = form.id
      ? await supabase.from("suppliers").update(payload).eq("id", form.id)
      : await supabase.from("suppliers").insert(payload);
    if (saveError) {
      const message = String(saveError.message ?? "").toLowerCase();
      if (message.includes("notes")) {
        setError("A coluna de observações ainda não existe no banco. Aplique a migration 0008_supplier_notes.sql.");
        return;
      }
      setError("Não foi possível salvar. Verifique permissões ou tente novamente.");
      return;
    }
    resetForm();
    await loadData();
  };

  return (
    <AppShell
      title="Fornecedores"
      actions={
        <div className="flex gap-2">
          {form.id && (
            <Button variant="outline" onClick={resetForm}>
              Cancelar edição
            </Button>
          )}
          <Button onClick={saveSupplier} disabled={!canWrite}>
            {form.id ? "Salvar alterações" : "Salvar fornecedor"}
          </Button>
        </div>
      }
    >
      {error && <p className="text-sm text-ember">{error}</p>}
      <Card className="p-6">
        <p className="text-xs uppercase text-steel">{form.id ? "Editar fornecedor" : "Novo fornecedor"}</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-xs uppercase text-steel">Nome do fornecedor</label>
            <Input
              placeholder="Nome do fornecedor"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              disabled={!canWrite}
            />
          </div>
          <div>
            <label className="text-xs uppercase text-steel">Email</label>
            <Input
              placeholder="Email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              disabled={!canWrite}
            />
          </div>
          <div>
            <label className="text-xs uppercase text-steel">Telefone</label>
            <Input
              placeholder="Telefone"
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
              disabled={!canWrite}
            />
          </div>
          <div>
            <label className="text-xs uppercase text-steel">Status</label>
            <select
              className="input"
              value={form.status}
              onChange={(event) =>
                setForm({ ...form, status: event.target.value === "INATIVO" ? "INATIVO" : "ATIVO" })
              }
              disabled={!canWrite}
            >
              <option value="ATIVO">ATIVO</option>
              <option value="INATIVO">INATIVO</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-xs uppercase text-steel">Observações</label>
            <textarea
              className="input min-h-24"
              placeholder="Pedidos, preferências e observações do fornecedor"
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
              disabled={!canWrite}
            />
          </div>
        </div>
      </Card>
      <Card className="p-6">
        <div className="overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-steel">
              <tr>
                <th className="py-2">Fornecedor</th>
                <th>Email</th>
                <th>Telefone</th>
                <th>Observações</th>
                <th>Status</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {suppliers.map((supplier) => (
                <tr key={supplier.id}>
                  <td className="py-3 font-semibold">{supplier.name}</td>
                  <td>{supplier.email ?? "-"}</td>
                  <td>{supplier.phone ?? "-"}</td>
                  <td className="max-w-[320px] truncate">{supplier.notes ?? "-"}</td>
                  <td>
                    <Badge tone={supplier.status === "ATIVO" ? "success" : "neutral"}>{supplier.status}</Badge>
                  </td>
                  <td>
                    {canWrite ? (
                      <Button variant="outline" onClick={() => editSupplier(supplier)}>
                        Editar
                      </Button>
                    ) : (
                      <span className="text-xs text-steel">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </AppShell>
  );
}
