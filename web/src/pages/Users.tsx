import { useEffect, useState } from "react";
import { AppShell } from "../components/layout/AppShell";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { supabase } from "../lib/supabaseClient";

export function Users() {
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("users_profile")
        .select("id, first_name, last_name, company, role, created_at")
        .order("created_at", { ascending: false });
      setUsers(data ?? []);
    };
    load();
  }, []);

  return (
    <AppShell title="Usuários">
      <Card className="p-6">
        <div className="overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-steel">
              <tr>
                <th className="py-2">Nome</th>
                <th>Empresa</th>
                <th>Role</th>
                <th>ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="py-3 font-semibold">{user.first_name} {user.last_name}</td>
                  <td>{user.company ?? "-"}</td>
                  <td>
                    <Badge tone={user.role === "ADMIN" ? "success" : "neutral"}>{user.role}</Badge>
                  </td>
                  <td className="text-xs text-steel">{user.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </AppShell>
  );
}
