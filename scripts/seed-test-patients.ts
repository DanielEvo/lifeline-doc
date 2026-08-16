// Standalone: cria 3 entradas de teste em patients_registry (identidade
// global LifeLine), pra testar a busca global do médico (searchPatientGlobal
// em src/lib/api/clinic.functions.ts). Reusa createRegistryEntry — mesma
// função que o app usa no autocadastro do paciente — pra garantir que
// globalId e publicCode (LifeLine ID) saem no formato real, sem duplicar a
// lógica de geração.
//
// Execução: bun run scripts/seed-test-patients.ts
// Precisa de SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente (o mesmo
// par que o app usa em produção — não estão configurados neste sandbox, por
// isso não rodei este script eu mesmo; rode você onde essas variáveis
// existirem, ex.: o terminal do Lovable Cloud).
//
// Idempotência: NÃO é idempotente — rodar duas vezes cria duplicatas (não há
// checagem de e-mail já existente, igual createRegistryEntry no app real).

import { createRegistryEntry } from "../src/lib/patients-registry.server";

const PESSOAS = [
  { fullName: "Daniel Pinto Rodrigues Evo", email: "daniel.rdg.evo@gmail.com" },
  { fullName: "Bruno Correia", email: "bruunocorreia@gmail.com" },
  { fullName: "Vitor Imamura", email: "imamuravitor@gmail.com" },
];

async function main() {
  for (const pessoa of PESSOAS) {
    const entry = await createRegistryEntry(
      { fullName: pessoa.fullName, email: pessoa.email },
      // "patient" (não "doctor"): representa uma identidade LifeLine já
      // existente, igual quem se autocadastrou pelo app do paciente — é o
      // caso que a busca global deveria encontrar.
      { type: "patient", id: crypto.randomUUID() },
    );
    console.log(`${entry.fullName} — LifeLine ID: ${entry.publicCode} (globalId: ${entry.globalId})`);
  }
}

main().catch((e) => {
  console.error("Falhou:", e);
  process.exit(1);
});
