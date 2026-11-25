import 'server-only';
import { env } from '@/lib/env';

/** Avisa o fluxo interno da Fluxa (n8n), que manda WhatsApp para o Mateus. Nunca derruba a requisição. */
export async function notifyFluxa(evento: string, dados: Record<string, unknown>) {
  const url = env.n8nWebhook;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: process.env.INTERNAL_API_TOKEN, evento, ...dados }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    // silencioso: o aviso é conveniência, não regra de negócio
  }
}
