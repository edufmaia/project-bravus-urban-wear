import { AppShell } from "../components/layout/AppShell";
import { Card } from "../components/ui/Card";

export function System() {
  return (
    <AppShell title="Sistema">
      <Card className="p-6">
        <p className="text-xs uppercase text-steel">Configurações</p>
        <p className="mt-4 text-lg font-semibold">Módulo em construção</p>
        <p className="text-sm text-steel">Use este espaço para ajustar integrações e preferências da Bravus Urban Wear.</p>
      </Card>
    </AppShell>
  );
}
