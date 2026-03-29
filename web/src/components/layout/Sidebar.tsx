import { NavLink } from "react-router-dom";
import {
  LayoutGrid,
  Package,
  Boxes,
  Truck,
  Users,
  SlidersHorizontal,
  ArrowLeftRight,
  ShoppingCart,
  ReceiptText,
  Tag,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useAuth } from "../../lib/auth";

const links = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { to: "/produtos", label: "Produtos", icon: Package },
  { to: "/estoque", label: "Estoque", icon: Boxes },
  { to: "/movimentacoes", label: "Movimentações", icon: ArrowLeftRight },
  { to: "/pdv", label: "PDV", icon: ShoppingCart, roles: ["ADMIN", "GERENTE", "OPERADOR"] },
  { to: "/vendas", label: "Vendas", icon: ReceiptText, roles: ["ADMIN", "GERENTE", "OPERADOR"] },
  { to: "/labels", label: "Etiquetas", icon: Tag, roles: ["ADMIN", "GERENTE", "OPERADOR"] },
  { to: "/fornecedores", label: "Fornecedores", icon: Truck },
  { to: "/usuarios", label: "Usuários", icon: Users, roles: ["ADMIN", "GERENTE"] },
  { to: "/sistema", label: "Sistema", icon: SlidersHorizontal, roles: ["ADMIN", "GERENTE"] },
];

export function Sidebar() {
  const { profile } = useAuth();
  const role = profile?.role ?? "VISUALIZADOR";

  return (
    <aside className="hidden w-64 flex-col gap-6 bg-white/80 p-6 shadow-soft backdrop-blur lg:flex">
      <div className="flex flex-col items-center text-center">
        <img src="/bravus-logo.png" alt="Bravus Urban Wear" className="h-40 w-auto" />
        <p className="mt-1 text-xs uppercase tracking-[0.3em] text-steel">Stock Control</p>
      </div>
      <nav className="flex flex-1 flex-col gap-2">
        {links
          .filter((link) => !link.roles || link.roles.includes(role))
          .map((link) => {
            const Icon = link.icon;
            return (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition",
                    isActive ? "bg-ink text-white shadow" : "text-ink/80 hover:bg-black/5"
                  )
                }
              >
                <Icon size={18} />
                {link.label}
              </NavLink>
            );
          })}
      </nav>
      <div className="rounded-2xl bg-black/5 p-4 text-xs text-steel">
        Loja conectada • Supabase Cloud
      </div>
    </aside>
  );
}

