/** Lê a resposta das rotas de IA. Se o servidor caiu por tempo (página de erro da Vercel, não JSON), devolve uma mensagem clara. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function aiJson(r: Response): Promise<any> {
  const text = await r.text();
  try { return JSON.parse(text); } catch {
    if (r.status === 504 || /timeout|timed out|FUNCTION_INVOCATION/i.test(text)) return { error: 'A IA demorou demais para responder. Tente de novo em instantes (com menos variações, se possível).' };
    return { error: `Falha na IA (erro ${r.status}). Tente de novo.` };
  }
}
