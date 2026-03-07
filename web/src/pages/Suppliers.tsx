import { useEffect, useState } from "react";
import { AppShell } from "../components/layout/AppShell";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth";

export function Suppliers() {
  const { profile } = useAuth();
  const role = profile?.role ?? "VISUALIZADOR";
  const canWrite = ["ADMIN", "GERENTE", "OPERADOR"].includes(role);

  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    const { data } = await supabase.from("suppliers").select("id, name, email, phone, status").order("name");
    setSuppliers(data ?? []);
  };

  useEffect(() => {
    loadData();
  }, []);

  const saveSupplier = async () => {
    if (!canWrite) {
      setError("Seu perfil não tem permissão para criar fornecedores.");
      return;
    }
    if (!form.name) return;
    setError(null);
    const { error: insertError } = await supabase.from("suppliers").insert({
      name: form.name,
      email: form.email,
      phone: form.phone,
    });
    if (insertError) {
      setError("Não foi possível salvar. Verifique permissões ou tente novamente.");
      return;
    }
    setForm({ name: "", email: "", phone: "" });
    await loadData();
  };

  return (
    <AppShell title="Fornecedores" actions={<Button onClick={saveSupplier} disabled={!canWrite}>Salvar fornecedor</Button>}>
      {error && <p className="text-sm text-ember">{error}</p>}
      <Card className="p-6">
        <p className="text-xs uppercase text-steel">Novo fornecedor</p>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Input
            placeholder="Nome do fornecedor"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            disabled={!canWrite}
          />
          <Input
            placeholder="Email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            disabled={!canWrite}
          />
          <Input
            placeholder="Telefone"
            value={form.phone}
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
            disabled={!canWrite}
          />
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
                <th>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {suppliers.map((supplier) => (
                <tr key={supplier.id}>
                  <td className="py-3 font-semibold">{supplier.name}</td>
                  <td>{supplier.email ?? "-"}</td>
                  <td>{supplier.phone ?? "-"}</td>
                  <td>
                    <Badge tone={supplier.status === "ATIVO" ? "success" : "neutral"}>{supplier.status}</Badge>
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
