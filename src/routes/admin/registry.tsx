// Registry global de identidade de pacientes — leitura.

import { createFileRoute } from "@tanstack/react-router";

import { adminListRegistry } from "@/lib/api/admin.functions";

export const Route = createFileRoute("/admin/registry")({
  loader: () => adminListRegistry(),
  component: AdminRegistry,
});

function AdminRegistry() {
  const { rows } = Route.useLoaderData();
  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold">Registry global</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {rows.length} identidades globais de paciente. Criado quando um paciente se cadastra ou
        quando um médico registra alguém novo no prontuário.
      </p>

      <div className="space-y-2">
        {rows.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Nenhuma entrada de registry ainda.
          </div>
        )}
        {rows.map((r: (typeof rows)[number]) => (
          <div key={r.globalId} className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="font-semibold">{r.fullName}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-mono">
                {r.globalId.slice(0, 8)}
              </span>
              <span className="ml-auto text-[11px] text-muted-foreground">
                criado por {r.createdBy.type} · {new Date(r.createdAt).toLocaleDateString("pt-BR")}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {r.email && <span>✉ {r.email}</span>}
              {r.telefone && <span>📱 {r.telefone}</span>}
              {r.cpf && <span>CPF {r.cpf}</span>}
              {r.birthDate && <span>nascimento {r.birthDate}</span>}
              {r.sexo && <span>sexo {r.sexo}</span>}
              {r.patientProfile?.tipoSanguineo && (
                <span>tipo {r.patientProfile.tipoSanguineo}</span>
              )}
              {r.patientProfile?.alergias && <span>alergias: {r.patientProfile.alergias}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
