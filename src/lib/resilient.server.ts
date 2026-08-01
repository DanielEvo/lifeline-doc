// Leituras opcionais — para fontes que podem estar indisponíveis (Supabase
// não configurado no ambiente, banco fora do ar) sem que isso justifique
// derrubar a tela inteira.
//
// Motivação concreta: depois da migração dos biomarcadores para Postgres
// (DAT-02), uma falha na tabela `measurements` derrubava TODO o prontuário —
// inclusive evoluções, SOAP e receitas, que continuam em arquivo local e
// estavam perfeitamente legíveis. O médico via uma tela de erro em vez do
// prontuário.
//
// Só para LEITURA. Escrita nunca deve passar por aqui: gravar num lugar
// alternativo quando a fonte oficial está fora criaria histórico clínico
// divergente. Escrita continua falhando alto, de propósito.

export type OptionalRead<T> = { data: T; unavailable: boolean };

export async function optionalRead<T>(
  label: string,
  run: () => Promise<T>,
  fallback: T,
): Promise<OptionalRead<T>> {
  try {
    return { data: await run(), unavailable: false };
  } catch (e) {
    console.error(`[leitura indisponível] ${label}:`, e instanceof Error ? e.message : e);
    return { data: fallback, unavailable: true };
  }
}
