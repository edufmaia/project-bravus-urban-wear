import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Card } from "../components/ui/Card";
import { supabase } from "../lib/supabaseClient";

const schema = z
  .object({
    firstName: z.string().min(2),
    lastName: z.string().min(2),
    company: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(6),
    confirm: z.string().min(6),
    terms: z.boolean().refine((value) => value),
  })
  .refine((data) => data.password === data.confirm, { message: "As senhas não coincidem", path: ["confirm"] });

export function Signup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    company: "",
    email: "",
    password: "",
    confirm: "",
    terms: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const result = schema.safeParse(form);
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Preencha os campos corretamente.");
      return;
    }
    setLoading(true);
    const { data, error: signError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: {
          first_name: form.firstName,
          last_name: form.lastName,
          company: form.company,
        },
      },
    });
    if (signError || !data.user) {
      setLoading(false);
      setError(signError?.message ?? "Não foi possível criar a conta.");
      return;
    }
    setLoading(false);
    if (data.session) {
      navigate("/dashboard");
      return;
    }
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-lg p-8">
        <div className="text-center">
          <p className="font-display text-4xl">Bravus Urban Wear</p>
          <p className="text-sm text-steel">Crie seu acesso à plataforma</p>
        </div>
        <form className="mt-8 space-y-4" onSubmit={onSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs font-semibold uppercase text-steel">Nome</label>
              <Input value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-steel">Sobrenome</label>
              <Input value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase text-steel">Empresa</label>
            <Input value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase text-steel">E-mail</label>
            <Input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs font-semibold uppercase text-steel">Senha</label>
              <Input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-steel">Confirmar</label>
              <Input type="password" value={form.confirm} onChange={(event) => setForm({ ...form, confirm: event.target.value })} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-steel">
            <input
              type="checkbox"
              checked={form.terms}
              onChange={(event) => setForm({ ...form, terms: event.target.checked })}
            />
            Aceito os termos e políticas da Bravus Urban Wear
          </label>
          {error && <p className="text-sm text-ember">{error}</p>}
          <Button className="w-full" disabled={loading}>
            {loading ? "Criando..." : "Criar conta"}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-steel">
          Já tem conta? <Link to="/login" className="font-semibold text-ink">Entrar</Link>
        </p>
      </Card>
    </div>
  );
}
