// Layout admin — sidebar + guard. beforeLoad chama adminStatus; se não
// desbloqueado, redireciona para /admin/entrar.

import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, LogOut, ShieldCheck, Stethoscope, User, Users, Beaker } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { adminLock, adminStatus } from "@/lib/api/admin.functions";

export const Route = createFileRoute("/admin")({
  beforeLoad: async ({ location }) => {
    if (location.pathname === "/admin/entrar") return;
    const { unlocked } = await adminStatus();
    if (!unlocked) {
      throw redirect({ to: "/admin/entrar" });
    }
  },
  head: () => ({ meta: [{ title: "LifeLine · Admin" }] }),
  component: AdminLayout,
});

function AdminLayout() {
  const navigate = useNavigate();
  const path =
    typeof window !== "undefined" ? window.location.pathname : "/admin";
  const isEntrar = path === "/admin/entrar";

  // Tela de login não usa o shell — renderiza direto
  if (isEntrar) return <Outlet />;

  const nav: Array<{
    to: "/admin" | "/admin/medicos" | "/admin/pacientes" | "/admin/registry" | "/admin/testes";
    label: string;
    icon: typeof LayoutDashboard;
    exact?: boolean;
  }> = [
    { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
    { to: "/admin/medicos", label: "Médicos", icon: Stethoscope },
    { to: "/admin/pacientes", label: "Pacientes", icon: Users },
    { to: "/admin/registry", label: "Registry global", icon: User },
    { to: "/admin/testes", label: "Painel de testes", icon: Beaker },
  ];

  const sair = async () => {
    await adminLock();
    toast.success("Sessão admin encerrada.");
    navigate({ to: "/admin/entrar" });
  };

  return (
    <div className="flex min-h-screen bg-muted/30">
      <aside className="hidden w-56 flex-col border-r border-border bg-background md:flex">
        <div className="flex h-14 items-center gap-2 border-b border-border px-4">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Admin</span>
        </div>
        <nav className="flex-1 space-y-1 p-2">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.exact ?? false }}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground [&.active]:bg-primary/10 [&.active]:text-primary"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-border p-2">
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={sair}>
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        {/* Header móvel */}
        <header className="flex h-14 items-center justify-between border-b border-border bg-background px-4 md:hidden">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Admin</span>
          </div>
          <Button variant="ghost" size="sm" onClick={sair}>
            <LogOut className="h-4 w-4" />
          </Button>
        </header>
        <div className="mx-auto max-w-5xl p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
