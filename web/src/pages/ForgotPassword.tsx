import { useState } from "react";
import { Link } from "react-router-dom";
import { z } from "zod";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Card } from "../components/ui/Card";
import { supabase } from "../lib/supabaseClient";

const schema = z.object({
  email: z.string().email(),
});

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSent(false);

    const result = schema.safeParse({ email });
    if (!result.success) {
      setError("Informe um e-mail válido.");
      return;
    }

    setLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });
    setLoading(false);

    if (resetError) {
      setError("Não foi possível enviar o e-mail de recuperação.");
      return;
    }

    setSent(true);
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md p-8">
        <div className="text-center">
          <p className="font-display text-4xl">Recuperar senha</p>
          <p className="text-sm text-steel">Enviaremos um link para redefinir seu acesso</p>
        </div>

        <form className="mt-8 space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="text-xs font-semibold uppercase text-steel">E-mail</label>
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="voce@bravus.com"
            />
          </div>

          {error && <p className="text-sm text-ember">{error}</p>}
          {sent && (
            <p className="text-sm text-emerald-600">
              Se o e-mail existir na base, enviamos um link de recuperação.
            </p>
          )}

          <Button className="w-full" disabled={loading}>
            {loading ? "Enviando..." : "Enviar link de recuperação"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-steel">
          Lembrou a senha?{" "}
          <Link to="/login" className="font-semibold text-ink">
            Voltar ao login
          </Link>
        </p>
      </Card>
    </div>
  );
}
