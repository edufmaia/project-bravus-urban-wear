import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppShell({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 lg:p-10">
        <Topbar />
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl tracking-wide text-ink">{title}</h1>
            <p className="text-sm text-steel">Gestão inteligente da Bravus Urban Wear</p>
          </div>
          {actions}
        </div>
        <div className="mt-8 space-y-6">{children}</div>
      </main>
    </div>
  );
}
