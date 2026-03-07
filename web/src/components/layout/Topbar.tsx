import { useMemo } from "react";
import { Search, Bell } from "lucide-react";
import { Button } from "../ui/Button";
import { useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabaseClient";

export function Topbar() {
  const { profile } = useAuth();
  const initials = useMemo(() => {
    const first = profile?.first_name?.[0] ?? "U";
    const last = profile?.last_name?.[0] ?? "S";
    return `${first}${last}`.toUpperCase();
  }, [profile]);

  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3 rounded-2xl bg-white/80 px-4 py-2 shadow-soft">
        <Search size={16} className="text-steel" />
        <input
          className="w-60 border-0 bg-transparent text-sm outline-none"
          placeholder="Buscar produtos, SKUs, fornecedores"
        />
      </div>
      <div className="flex items-center gap-3">
        <button className="flex h-10 w-10 items-center justify-center rounded-full bg-white/80 shadow-soft">
          <Bell size={16} />
        </button>
        <div className="flex items-center gap-3 rounded-full bg-white/80 px-4 py-2 shadow-soft">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white">
            {initials}
          </div>
          <div className="text-sm">
            <p className="font-semibold">
              {profile?.first_name ?? "Usuário"} {profile?.last_name ?? "Bravus"}
            </p>
            <p className="text-xs text-steel">{profile?.role ?? "ADMIN"}</p>
          </div>
          <Button
            variant="ghost"
            className="text-xs"
            onClick={() => {
              supabase.auth.signOut();
            }}
          >
            Sair
          </Button>
        </div>
      </div>
    </header>
  );
}
