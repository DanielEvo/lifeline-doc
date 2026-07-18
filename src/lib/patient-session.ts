// Client-side session storage for the logged-in patient.
// The token is issued and verifiable server-side (see patient-auth.functions.ts).
// Chave de localStorage DIFERENTE da sessão de médico — nunca "lifeline.session",
// para não colidir com a sessão do médico no mesmo navegador.

export type PatientSession = { token: string; nome: string; email: string };

const KEY = "lifeline.patient.session";

export function getPatientSession(): PatientSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PatientSession;
    if (!parsed?.token || !parsed?.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setPatientSession(s: PatientSession) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // storage unavailable (private mode) — session lives only in memory/page
  }
}

export function clearPatientSession() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // noop
  }
}
