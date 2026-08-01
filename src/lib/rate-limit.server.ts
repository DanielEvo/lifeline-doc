// Rate limiting em memória, reaproveitável — generaliza o padrão que já
// existia só em admin-auth.server.ts (Map por chave normalizada, contador +
// lockout). Não sobrevive a restart do processo nem funciona multi-instância:
// é proteção contra abuso ao vivo, não um requisito de durabilidade.

export type RateLimiter = {
  /** true se a chave está temporariamente bloqueada. */
  isLocked: (key: string) => boolean;
  /** Registra uma tentativa (falha de login, pedido de reset, etc.);
   *  bloqueia a chave ao atingir o limite. */
  registerFailure: (key: string) => void;
  /** Limpa o histórico de falhas — ação bem-sucedida (ex.: login ok). */
  registerSuccess: (key: string) => void;
};

export function createRateLimiter(opts: { maxAttempts: number; lockoutMs: number }): RateLimiter {
  const attempts = new Map<string, { count: number; lockedUntil: number | null }>();
  const normalize = (key: string) => key.trim().toLowerCase();

  return {
    isLocked(key) {
      const a = attempts.get(normalize(key));
      return !!a?.lockedUntil && a.lockedUntil > Date.now();
    },
    registerFailure(key) {
      const k = normalize(key);
      const a = attempts.get(k) ?? { count: 0, lockedUntil: null };
      a.count += 1;
      if (a.count >= opts.maxAttempts) {
        a.lockedUntil = Date.now() + opts.lockoutMs;
        a.count = 0;
      }
      attempts.set(k, a);
    },
    registerSuccess(key) {
      attempts.delete(normalize(key));
    },
  };
}

export type UsageCounter = {
  /** Total já usado na janela atual (sem incrementar). */
  count: (key: string) => number;
  /** Registra um uso e devolve o novo total na janela atual. */
  increment: (key: string) => number;
};

/** Contador por janela deslizante — pra tetos de uso (ex.: OCR por conta),
 *  não pra bloqueio de força bruta. */
export function createUsageCounter(windowMs: number): UsageCounter {
  const buckets = new Map<string, { count: number; windowStart: number }>();
  function bucketFor(key: string) {
    const now = Date.now();
    const b = buckets.get(key);
    if (!b || now - b.windowStart >= windowMs) {
      const fresh = { count: 0, windowStart: now };
      buckets.set(key, fresh);
      return fresh;
    }
    return b;
  }
  return {
    count: (key) => bucketFor(key).count,
    increment: (key) => {
      const b = bucketFor(key);
      b.count += 1;
      return b.count;
    },
  };
}
