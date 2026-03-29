import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { z } from "zod";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Card } from "../components/ui/Card";
import { supabase } from "../lib/supabaseClient";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const result = schema.safeParse(form);
    if (!result.success) {
      setError("Preencha e-mail e senha válidos.");
      return;
    }
    setLoading(true);
    const { error: signError } = await supabase.auth.signInWithPassword({
      email: form.email,
      password: form.password,
    });
    setLoading(false);
    if (signError) {
      setError("Não foi possível entrar. Verifique seus dados.");
      return;
    }
    navigate("/dashboard");
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md p-8">
        <div className="text-center">
          <div className="flex justify-center">
            <img src="/bravus-logo.png" alt="Bravus Urban Wear" className="h-16 w-auto" />
          </div>
          <p className="mt-2 text-sm text-steel">Acesse sua operação de estoque</p>
        </div>
        <form className="mt-8 space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="text-xs font-semibold uppercase text-steel">E-mail</label>
            <Input
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              placeholder="voce@bravus.com"
            />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-semibold uppercase text-steel">Senha</label>
              <Link to="/recuperar-senha" className="text-xs font-semibold text-ink">
                Esqueci minha senha
              </Link>
            </div>
            <Input
              type="password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              placeholder="••••••••"
            />
          </div>
          {error && <p className="text-sm text-ember">{error}</p>}
          <Button className="w-full" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-steel">
          Ainda não tem conta? <Link to="/cadastro" className="font-semibold text-ink">Criar cadastro</Link>
        </p>
      </Card>
    </div>
  );
}
