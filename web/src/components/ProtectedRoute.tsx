import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

type AllowedRole = "ADMIN" | "GERENTE" | "OPERADOR" | "VISUALIZADOR";

export function ProtectedRoute({
  children,
  roles,
}: {
  children: React.ReactNode;
  roles?: AllowedRole[];
}) {
  const { session, loading, profile } = useAuth();
  if (loading) return <div className="p-10 text-sm">Carregando...</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (roles && !roles.includes((profile?.role as AllowedRole | null) ?? "VISUALIZADOR")) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}
