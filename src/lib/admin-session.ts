// Client-side session storage para o painel de admin (/admin). Chave de
// localStorage separada das sessões de médico e paciente — nunca colide.

export type AdminSession = { token: string };

const KEY = "lifeline.admin.session";

export function getAdminSession(): AdminSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AdminSession;
    if (!parsed?.token) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setAdminSession(s: AdminSession) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // storage unavailable (private mode) — session lives only in memory/page
  }
}

export function clearAdminSession() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // noop
  }
}
