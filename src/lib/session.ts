// Client-side session storage for the logged-in doctor.
// The token is issued and verifiable server-side (see auth.functions.ts).

export type DoctorSession = { token: string; nome: string; email: string };

const KEY = "lifeline.session";

export function getSession(): DoctorSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DoctorSession;
    if (!parsed?.token || !parsed?.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setSession(s: DoctorSession) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // storage unavailable (private mode) — session lives only in memory/page
  }
}

export function clearSession() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // noop
  }
}
