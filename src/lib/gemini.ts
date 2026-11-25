import 'server-only';
import { env } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';
import { LIMITS, type Plan } from '@/lib/plans';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
let cursor = 0;

export class QuotaError extends Error {}

type Part = { text?: string; inlineData?: { mimeType: string; data: string } };

async function call(model: string, body: unknown): Promise<{ parts: Part[]; tin: number; tout: number }> {
  const keys = env.geminiKeys;
  if (!keys.length) throw new Error('Nenhuma chave do Gemini configurada');
  let lastErr = '';
  // Tenta cada chave uma vez, começando pela próxima da fila (reparte o uso entre as chaves).
  for (let i = 0; i < keys.length; i++) {
    const key = keys[(cursor + i) % keys.length];
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(`${BASE}/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
      });
      if (res.ok) {
        cursor = (cursor + i + 1) % keys.length;
        const j = await res.json();
        const parts: Part[] = j?.candidates?.[0]?.content?.parts || [];
        if (!parts.length) throw new Error('A IA não devolveu conteúdo (pode ter sido bloqueado pelo filtro de segurança). Reformule o pedido.');
        return { parts, tin: j?.usageMetadata?.promptTokenCount || 0, tout: j?.usageMetadata?.candidatesTokenCount || 0 };
      }
      lastErr = `${res.status} ${(await res.text()).slice(0, 300)}`;
      if (res.status === 429 || res.status === 403 || res.status === 401) break; // próxima chave
      if (res.status >= 500 && attempt === 0) { await new Promise((r) => setTimeout(r, 1200)); continue; }
      throw new Error(`Erro do Gemini: ${lastErr}`);
    }
  }
  throw new Error(`Todas as chaves do Gemini falharam ou estão no limite. Último erro: ${lastErr}`);
}

async function checkQuota(clinicId: string, plan: Plan, kind: 'text' | 'image') {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('ai_usage_this_month', { cid: clinicId, k: kind });
  if (error) throw new Error(error.message);
  const lim = kind === 'text' ? LIMITS[plan].textosIA : LIMITS[plan].imagensIA;
  if ((data as number) >= lim) {
    throw new QuotaError(kind === 'text'
      ? `Limite de ${lim} gerações de texto por mês atingido. Ele renova no dia 1º.`
      : `Limite de ${lim} imagens por IA por mês atingido. Ele renova no dia 1º.`);
  }
}

async function logUsage(clinicId: string, kind: 'text' | 'image', feature: string, userId: string, tin: number, tout: number) {
  const admin = createAdminClient();
  await admin.from('ai_usage').insert({ clinic_id: clinicId, kind, feature, user_id: userId, tokens_in: tin, tokens_out: tout });
}

export interface AiCtx { clinicId: string; plan: Plan; userId: string; feature: string }

/** Gera JSON validado pelo schema do Gemini. */
export async function generateJson<T>(ctx: AiCtx, system: string, prompt: string, schema: object, temperature = 0.9): Promise<T> {
  await checkQuota(ctx.clinicId, ctx.plan, 'text');
  const { parts, tin, tout } = await call(env.geminiModel, {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature, responseMimeType: 'application/json', responseSchema: schema },
  });
  await logUsage(ctx.clinicId, 'text', ctx.feature, ctx.userId, tin, tout);
  const text = parts.map((p) => p.text || '').join('');
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('A IA devolveu um formato inválido. Tente de novo.');
  }
}

/** Gera uma imagem (PNG em base64). Usada só para fundos e cenários, nunca para rostos de pessoas reais. */
export async function generateImage(ctx: AiCtx, prompt: string, aspectRatio: '4:5' | '9:16' | '1:1'): Promise<{ mime: string; data: string }> {
  await checkQuota(ctx.clinicId, ctx.plan, 'image');
  const { parts, tin, tout } = await call(env.geminiImageModel, {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio } },
  });
  const img = parts.find((p) => p.inlineData?.data);
  if (!img?.inlineData) throw new Error('A IA não devolveu imagem. Reformule a descrição.');
  await logUsage(ctx.clinicId, 'image', ctx.feature, ctx.userId, tin, tout);
  return { mime: img.inlineData.mimeType, data: img.inlineData.data };
}

/** Regras de publicidade usadas em todo prompt de marketing. */
export function complianceRules(kind: 'odonto' | 'estetica', resp?: { name?: string | null; reg?: string | null }) {
  const comum = [
    'Não prometa resultado garantido, cura ou "sem dor".',
    'Não use superlativos absolutos ("o melhor", "o único", "o mais barato").',
    'Não cite preço, desconto, parcelamento, promoção, sorteio nem serviço gratuito, a menos que a clínica peça explicitamente; nesse caso, inclua um alerta em "compliance".',
    'Não use imagens de antes e depois nem fale de casos de pacientes identificáveis.',
    'Não fale de condições de saúde do leitor na 2ª pessoa de forma acusatória (política de anúncios da Meta): fale da clínica e do cuidado.',
    'Linguagem respeitosa, clara, em português do Brasil.',
  ];
  const esp = kind === 'odonto'
    ? ['Odontologia segue o Código de Ética do CFO: inclua no rodapé o nome e o CRO do responsável técnico quando informado.']
    : ['Estética: não use termos médicos que a clínica não pode exercer e não prometa resultados de procedimentos.'];
  const rt = resp?.name ? [`Responsável técnico: ${resp.name}${resp.reg ? ` — ${resp.reg}` : ''}.`] : [];
  return [...comum, ...esp, ...rt].map((r) => `- ${r}`).join('\n');
}
