import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Card } from "../components/ui/Card";
import { supabase } from "../lib/supabaseClient";

const schema = z
  .object({
    password: z.string().min(6, "A senha deve ter ao menos 6 caracteres."),
    confirm: z.string().min(6, "A confirmação deve ter ao menos 6 caracteres."),
  })
  .refine((data) => data.password === data.confirm, {
    message: "As senhas não coincidem.",
    path: ["confirm"],
  });

export function ResetPassword() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ password: "", confirm: "" });
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setHasRecoverySession(Boolean(data.session));
      setCheckingSession(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY" || Boolean(session)) {
        setHasRecoverySession(true);
      }
      setCheckingSession(false);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!hasRecoverySession) {
      setError("Link inválido ou expirado. Solicite um novo link de recuperação.");
      return;
    }

    const result = schema.safeParse(form);
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Dados inválidos.");
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: form.password });
    if (updateError) {
      setLoading(false);
      setError("Não foi possível redefinir sua senha.");
      return;
    }

    await supabase.auth.signOut();
    setLoading(false);
    setSuccess(true);
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md p-8">
        <div className="text-center">
          <p className="font-display text-4xl">Redefinir senha</p>
          <p className="text-sm text-steel">Escolha uma nova senha para sua conta</p>
        </div>

        {checkingSession ? (
          <p className="mt-8 text-center text-sm text-steel">Validando link de recuperação...</p>
        ) : !hasRecoverySession ? (
          <div className="mt-8 space-y-3 text-center">
            <p className="text-sm text-ember">Link inválido ou expirado.</p>
            <Link to="/recuperar-senha" className="text-sm font-semibold text-ink">
              Solicitar novo link
            </Link>
          </div>
        ) : success ? (
          <div className="mt-8 space-y-4 text-center">
            <p className="text-sm text-emerald-600">Senha redefinida com sucesso.</p>
            <Button className="w-full" onClick={() => navigate("/login", { replace: true })}>
              Ir para o login
            </Button>
          </div>
        ) : (
          <form className="mt-8 space-y-4" onSubmit={onSubmit}>
            <div>
              <label className="text-xs font-semibold uppercase text-steel">Nova senha</label>
              <Input
                type="password"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                placeholder="••••••••"
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase text-steel">Confirmar senha</label>
              <Input
                type="password"
                value={form.confirm}
                onChange={(event) => setForm({ ...form, confirm: event.target.value })}
                placeholder="••••••••"
              />
            </div>

            {error && <p className="text-sm text-ember">{error}</p>}

            <Button className="w-full" disabled={loading}>
              {loading ? "Salvando..." : "Salvar nova senha"}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
