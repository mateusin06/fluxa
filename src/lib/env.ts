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
  get geminiKeys() { return req('GEMINI_API_KEYS').split(',').map((s) => s.trim()).filter(Boolean); },
  get geminiModel() { return process.env.GEMINI_MODEL || 'gemini-3.8-flash'; },
  get geminiImageModel() { return process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image'; },
  get pagarmeSecret() { return req('PAGARME_SECRET_KEY'); },
  get pagarmeWebhookUser() { return req('PAGARME_WEBHOOK_USER'); },
  get pagarmeWebhookPassword() { return req('PAGARME_WEBHOOK_PASSWORD'); },
  get internalToken() { return req('INTERNAL_API_TOKEN'); },
  get n8nWebhook() { return process.env.FLUXA_N8N_WEBHOOK_URL || ''; },
  get cronSecret() { return req('CRON_SECRET'); },
};
