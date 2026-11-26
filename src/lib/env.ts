import 'server-only';

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente ausente: ${name}`);
  return v;
}

export const env = {
  get supabaseUrl() { return req('NEXT_PUBLIC_SUPABASE_URL'); },
  get supabaseAnon() { return req('NEXT_PUBLIC_SUPABASE_ANON_KEY'); },
  get serviceRole() { return req('SUPABASE_SERVICE_ROLE_KEY'); },
  get appUrl() { return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, ''); },
  // IA: OpenAI é o provedor principal; o Gemini é a reserva automática. Basta uma das duas chaves.
  get openaiKeys() { return (process.env.OPENAI_API_KEY || '').split(',').map((s) => s.trim()).filter(Boolean); },
  get openaiModel() { return process.env.OPENAI_MODEL || 'gpt-5.4-mini'; },
  get openaiImageModel() { return process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.6-sunburst'; },
  /** none | low | medium | high. "low" é o equilíbrio entre qualidade do texto, tempo e custo. */
  get openaiReasoning() { return process.env.OPENAI_REASONING || 'low'; },
  /** low | medium | high. "medium" para fundos de anúncio (high gasta mais tokens de imagem). */
  get openaiImageQuality() { return process.env.OPENAI_IMAGE_QUALITY || 'medium'; },
  get geminiKeys() { return (process.env.GEMINI_API_KEYS || '').split(',').map((s) => s.trim()).filter(Boolean); },
  get geminiModel() { return process.env.GEMINI_MODEL || 'gemini-3.6-flash'; },
  get geminiImageModel() { return process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image'; },
  get pagarmeSecret() { return req('PAGARME_SECRET_KEY'); },
  get pagarmeWebhookUser() { return req('PAGARME_WEBHOOK_USER'); },
  get pagarmeWebhookPassword() { return req('PAGARME_WEBHOOK_PASSWORD'); },
  get internalToken() { return req('INTERNAL_API_TOKEN'); },
  get n8nWebhook() { return process.env.FLUXA_N8N_WEBHOOK_URL || ''; },
  get cronSecret() { return req('CRON_SECRET'); },
};
