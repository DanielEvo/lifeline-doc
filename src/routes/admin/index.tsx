import { createFileRoute } from "@tanstack/react-router";
import { Stethoscope, Users, User } from "lucide-react";

import { adminDashboard } from "@/lib/api/admin.functions";

export const Route = createFileRoute("/admin/")({
  loader: () => adminDashboard(),
  component: AdminDashboard,
});

function AdminDashboard() {
  const data = Route.useLoaderData();
  const cards = [
    { label: "Médicos cadastrados", value: data.doctors, icon: Stethoscope },
    { label: "Contas de paciente", value: data.patients, icon: Users },
    { label: "Registry global", value: data.registry, icon: User },
  ];
  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold">Visão geral</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Números vivos do LifeLine — atualiza a cada carregamento.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-border bg-card p-5">
            <c.icon className="h-5 w-5 text-primary" />
            <div className="mt-3 text-3xl font-bold tabular-nums">{c.value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{c.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
