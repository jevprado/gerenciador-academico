// Converte o erro do Supabase (objeto simples) em um Error de verdade, com mensagem legível.
export function dbError(error: { code?: string; message: string }) {
  if (error.code === "PGRST205" || error.code === "42P01") {
    return new Error(
      `Tabela não encontrada no Supabase (${error.message}). Rode a migração em supabase/migrations no SQL Editor.`,
    );
  }
  return new Error(`Erro do Supabase${error.code ? ` (${error.code})` : ""}: ${error.message}`);
}
