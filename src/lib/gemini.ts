import 'server-only';
import { env } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';
import { LIMITS, MAX_TOKENS_POR_CHAMADA, type Plan } from '@/lib/plans';

// GEMINI_BASE_URL / OPENAI_BASE_URL: só para teste local (servidores simulados)
const BASE = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/models';
const OPENAI_BASE = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
let cursor = 0;
let ocursor = 0;

export class QuotaError extends Error {}
/** A IA demorou demais no total. Não adianta tentar outra chave nem outro modelo dentro do mesmo pedido. */
export class AiTimeout extends Error {}
/** O pedido foi bloqueado pelo filtro de segurança de todos os modelos tentados: é preciso reformular. */
export class AiBlocked extends Error {}
class NoImage extends Error {}

type Part = { text?: string; inlineData?: { mimeType: string; data: string }; thought?: boolean };

/**
 * TODOS os modelos que o sistema tenta, em ordem.
 * 1º OpenAI (OPENAI_MODEL / OPENAI_IMAGE_MODEL), se OPENAI_API_KEY estiver configurada.
 * Depois, como reserva, todos os modelos do Gemini, se GEMINI_API_KEYS estiver configurada.
 * Se um modelo estiver sobrecarregado (503), sem cota (429), fora do ar (5xx), inexistente para a chave (404/400),
 * lento demais, com JSON quebrado ou com o pedido recusado pelo filtro, o próximo assume.
 * Fontes: developers.openai.com/api/docs/models e ai.google.dev/gemini-api/docs/models (nov/2026).
 */
const uniq = (l: string[]) => [...new Set(l.map((x) => x.trim()).filter(Boolean))];
const fromEnv = (v: string) => v.split(',');
const isOpenAI = (m: string) => /^(gpt-|chatgpt-|o\d)/.test(m);
const GEMINI_TEXT = ['gemini-3.6-flash', 'gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3-flash-preview',
  'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-4-argon', 'gemini-3.1-pro-preview', 'gemini-2.5-pro'];
const GEMINI_IMAGE = ['gemini-3.1-flash-image', 'gemini-nano-banana-2.1', 'gemini-3.1-flash-lite-image', 'gemini-3-pro-image', 'gemini-2.5-flash-image',
  // Imagen (outro endpoint, :predict): última linha de defesa para fundos de arte
  'imagen-4.0-fast-generate-001', 'imagen-4.0-generate-001', 'imagen-4.0-ultra-generate-001'];
export const TEXT_MODELS = () => uniq([
  ...(env.openaiKeys.length ? fromEnv(env.openaiModel) : []),
  ...(env.geminiKeys.length ? [...fromEnv(env.geminiModel), ...GEMINI_TEXT] : []),
]);
export const IMAGE_MODELS = () => uniq([
  ...(env.openaiKeys.length ? fromEnv(env.openaiImageModel) : []),
  ...(env.geminiKeys.length ? [...fromEnv(env.geminiImageModel), ...GEMINI_IMAGE] : []),
]);
const NO_KEYS = 'Nenhuma chave de IA configurada. Coloque OPENAI_API_KEY (ou GEMINI_API_KEYS) nas variáveis de ambiente.';

/** Tempo total de cada pedido (abaixo do maxDuration das rotas) e o máximo que um modelo pode segurar o pedido. */
const BUDGET_MS = 100_000;
const PER_MODEL_TEXT_MS = 40_000;
const PER_MODEL_IMAGE_MS = 50_000;
// OpenAI: o gpt-image costuma levar 20–60 s por imagem; texto com raciocínio baixo, 5–25 s
const OA_TEXT_MS = 50_000;
const OA_IMAGE_MS = 80_000;
const TIMEOUT_MSG = 'A IA demorou demais para responder. Tente de novo em instantes.';

type CallOut = { parts: Part[]; tin: number; tout: number };

/** Uma chamada a um modelo, revezando as chaves. Erros de modelo (503, 404...) sobem para a troca de modelo. */
async function call(model: string, endpoint: 'generateContent' | 'predict', body: unknown, deadline: number, perModelMs: number): Promise<CallOut | Record<string, unknown>> {
  const keys = env.geminiKeys;
  if (!keys.length) throw new Error('GEMINI_API_KEYS não configurada.');
  const modelEnd = Math.min(deadline, Date.now() + perModelMs);
  let lastErr = '';
  for (let i = 0; i < keys.length; i++) {
    const key = keys[(cursor + i) % keys.length];
    for (let attempt = 0; attempt < 2; attempt++) {
      const left = modelEnd - Date.now();
      if (deadline - Date.now() < 4_000) throw new AiTimeout(TIMEOUT_MSG);
      if (left < 3_000) throw new Error(`${model}: lento demais (${Math.round(perModelMs / 1000)} s)`);
      let res: Response;
      try {
        res = await fetch(`${BASE}/${model}:${endpoint}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify(body), signal: AbortSignal.timeout(left),
        });
      } catch (e) {
        const n = (e as Error).name;
        if (n === 'TimeoutError' || n === 'AbortError') {
          if (deadline - Date.now() < 4_000) throw new AiTimeout(TIMEOUT_MSG);
          throw new Error(`${model}: lento demais`);
        }
        lastErr = (e as Error).message;
        if (attempt === 0) continue;
        break;
      }
      if (res.ok) {
        cursor = (cursor + i + 1) % keys.length;
        const j = await res.json();
        if (endpoint === 'predict') return j as Record<string, unknown>;
        const cand = j?.candidates?.[0];
        const blocked = j?.promptFeedback?.blockReason || (/SAFETY|PROHIBITED|BLOCKLIST|SPII/.test(String(cand?.finishReason || '')) ? cand.finishReason : '');
        if (blocked) throw new AiBlocked('O pedido foi bloqueado pelo filtro de segurança da IA. Reformule o texto (sem termos médicos sensíveis, promessas ou antes e depois).');
        const parts: Part[] = (cand?.content?.parts || []).filter((p: Part) => !p.thought);
        if (!parts.length) throw new Error(`${model}: resposta vazia`);
        return { parts, tin: j?.usageMetadata?.promptTokenCount || 0, tout: j?.usageMetadata?.candidatesTokenCount || 0 };
      }
      lastErr = `${res.status} ${(await res.text()).slice(0, 200)}`;
      if (res.status === 429 || res.status === 403 || res.status === 401) break; // próxima chave
      if (res.status >= 500 && attempt === 0) { await new Promise((r) => setTimeout(r, 1200)); continue; } // 503: espera e tenta 1x
      throw new Error(`${model}: ${lastErr}`); // 400/404 (modelo não existe para a chave) ou 5xx de novo: próximo modelo
    }
  }
  throw new Error(`${model}: ${lastErr || 'todas as chaves falharam'}`);
}

/**
 * Modelos 3.x "pensam" antes de responder (pode passar de um minuto). Para marketing, pensamento baixo basta.
 * Se o modelo não aceitar o campo (400 citando thinking), repete sem ele.
 */
function withThinking(model: string, gen: Record<string, unknown>) {
  if (/^gemini-(3|4)/.test(model)) return { ...gen, thinkingConfig: { thinkingLevel: 'low' } };
  if (/^gemini-2\.5-flash/.test(model)) return { ...gen, thinkingConfig: { thinkingBudget: 0 } };
  return gen;
}
async function callText(model: string, body: { generationConfig: Record<string, unknown> } & Record<string, unknown>, deadline: number): Promise<CallOut> {
  try {
    return (await call(model, 'generateContent', { ...body, generationConfig: withThinking(model, body.generationConfig) }, deadline, PER_MODEL_TEXT_MS)) as CallOut;
  } catch (e) {
    if (e instanceof AiTimeout || e instanceof AiBlocked) throw e;
    if (/thinking/i.test((e as Error).message) && /\b400\b/.test((e as Error).message)) return (await call(model, 'generateContent', body, deadline, PER_MODEL_TEXT_MS)) as CallOut;
    throw e;
  }
}

// ------------------------------- OpenAI ---------------------------------------

/** Erro da OpenAI que não muda trocando de chave (ex.: modelo inexistente, parâmetro recusado). */
class OaHttpError extends Error { constructor(msg: string, public status: number, public code: string) { super(msg); } }

/** Uma chamada à OpenAI, revezando as chaves de OPENAI_API_KEY (aceita várias separadas por vírgula). */
async function oaCall(path: '/chat/completions' | '/images/generations', model: string, body: unknown, deadline: number, perModelMs: number): Promise<Record<string, any>> {
  const keys = env.openaiKeys;
  if (!keys.length) throw new Error('OPENAI_API_KEY não configurada.');
  const modelEnd = Math.min(deadline, Date.now() + perModelMs);
  let lastErr = '';
  for (let i = 0; i < keys.length; i++) {
    const key = keys[(ocursor + i) % keys.length];
    for (let attempt = 0; attempt < 2; attempt++) {
      const left = modelEnd - Date.now();
      if (deadline - Date.now() < 4_000) throw new AiTimeout(TIMEOUT_MSG);
      if (left < 3_000) throw new Error(`${model}: lento demais (${Math.round(perModelMs / 1000)} s)`);
      let res: Response;
      try {
        res = await fetch(`${OPENAI_BASE}${path}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
          body: JSON.stringify(body), signal: AbortSignal.timeout(left),
        });
      } catch (e) {
        const n = (e as Error).name;
        if (n === 'TimeoutError' || n === 'AbortError') {
          if (deadline - Date.now() < 4_000) throw new AiTimeout(TIMEOUT_MSG);
          throw new Error(`${model}: lento demais`);
        }
        lastErr = (e as Error).message;
        if (attempt === 0) continue;
        break;
      }
      if (res.ok) { ocursor = (ocursor + i + 1) % keys.length; return await res.json(); }
      const txt = await res.text();
      let code = '';
      try { const j = JSON.parse(txt); code = String(j?.error?.code || j?.error?.type || ''); } catch { /* texto puro */ }
      lastErr = `${res.status} ${txt.slice(0, 200)}`;
      if (res.status === 400 && /moderation_blocked|content_policy|safety/i.test(code + txt)) {
        throw new AiBlocked('O pedido foi recusado pelo filtro de segurança da IA. Reformule o texto (sem termos médicos sensíveis, promessas ou antes e depois).');
      }
      if (res.status === 429 || res.status === 401 || res.status === 403) break; // sem crédito/limite ou chave inválida: próxima chave
      if (res.status >= 500 && attempt === 0) { await new Promise((r) => setTimeout(r, 1200)); continue; }
      throw new OaHttpError(`${model}: ${lastErr}`, res.status, code);
    }
  }
  throw new Error(`${model}: ${lastErr || 'todas as chaves falharam'}`);
}

/**
 * Converte o schema no formato do Gemini (type: 'OBJECT'...) para JSON Schema estrito da OpenAI:
 * tipos em minúsculas, todos os campos obrigatórios e sem campos extras.
 */
function toJsonSchema(s: any): any {
  if (!s || typeof s !== 'object') return { type: 'string' };
  const t = String(s.type || 'string').toLowerCase();
  const out: Record<string, unknown> = { type: t };
  if (s.description) out.description = s.description;
  if (Array.isArray(s.enum)) out.enum = s.enum;
  if (t === 'object') {
    const props = (s.properties || {}) as Record<string, unknown>;
    out.properties = Object.fromEntries(Object.entries(props).map(([k, v]) => [k, toJsonSchema(v)]));
    out.required = Object.keys(props);
    out.additionalProperties = false;
  }
  if (t === 'array') out.items = toJsonSchema(s.items);
  return out;
}

/** Texto em JSON pela OpenAI (Chat Completions + Structured Outputs). Modelos com raciocínio não aceitam temperature. */
async function openaiJson(model: string, system: string, prompt: string, schema: object, deadline: number): Promise<{ text: string; tin: number; tout: number }> {
  const body: Record<string, unknown> = {
    model,
    messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
    response_format: { type: 'json_schema', json_schema: { name: 'resposta', strict: true, schema: toJsonSchema(schema) } },
    max_completion_tokens: MAX_TOKENS_POR_CHAMADA,
  };
  if (env.openaiReasoning && env.openaiReasoning !== 'default') body.reasoning_effort = env.openaiReasoning;
  let j: Record<string, any>;
  try {
    j = await oaCall('/chat/completions', model, body, deadline, OA_TEXT_MS);
  } catch (e) {
    // Modelo que não aceita algum parâmetro: repete só com o essencial
    if (e instanceof OaHttpError && e.status === 400 && /reasoning|max_completion_tokens|unsupported/i.test(e.message)) {
      delete body.reasoning_effort; delete body.max_completion_tokens;
      j = await oaCall('/chat/completions', model, body, deadline, OA_TEXT_MS);
    } else throw e;
  }
  const ch = j?.choices?.[0];
  if (ch?.message?.refusal || ch?.finish_reason === 'content_filter') {
    throw new AiBlocked('O pedido foi recusado pelo filtro de segurança da IA. Reformule o texto (sem termos médicos sensíveis, promessas ou antes e depois).');
  }
  if (ch?.finish_reason === 'length') throw new Error(`${model}: resposta cortada (limite de tokens)`);
  const text = String(ch?.message?.content || '').trim();
  if (!text) throw new Error(`${model}: resposta vazia`);
  return { text, tin: j?.usage?.prompt_tokens || 0, tout: j?.usage?.completion_tokens || 0 };
}

/** Tamanhos do gpt-image: o fundo é recortado (object-fit: cover) para o formato da arte. */
const OA_SIZE: Record<string, string> = { '4:5': '1024x1536', '9:16': '1024x1536', '1:1': '1024x1024' };

async function openaiImage(model: string, prompt: string, aspectRatio: string, deadline: number) {
  const body: Record<string, unknown> = { model, prompt, size: OA_SIZE[aspectRatio] || '1024x1024', quality: env.openaiImageQuality, n: 1, output_format: 'png' };
  let j: Record<string, any>;
  try {
    j = await oaCall('/images/generations', model, body, deadline, OA_IMAGE_MS);
  } catch (e) {
    if (e instanceof OaHttpError && e.status === 400 && /quality|output_format|size/i.test(e.message)) {
      j = await oaCall('/images/generations', model, { model, prompt, n: 1 }, deadline, OA_IMAGE_MS);
    } else throw e;
  }
  const b64 = j?.data?.[0]?.b64_json;
  if (!b64) throw new NoImage(`${model}: sem imagem`);
  const fmt = String(j?.output_format || 'png');
  return { mime: fmt === 'jpeg' ? 'image/jpeg' : fmt === 'webp' ? 'image/webp' : 'image/png', data: b64 as string, tin: j?.usage?.input_tokens || 0, tout: j?.usage?.output_tokens || 0 };
}

// --------------------------------------------------------------------------------

/** Tenta cada modelo da lista. Para só em: limite do plano, bloqueio de segurança ou tempo total esgotado. */
async function withFallback<T>(models: string[], run: (model: string) => Promise<T>): Promise<T> {
  if (!models.length) throw new Error(NO_KEYS);
  const errs: string[] = [];
  let blocked: AiBlocked | null = null;
  for (const m of models) {
    try {
      return await run(m);
    } catch (e) {
      if (e instanceof QuotaError || e instanceof AiTimeout) throw e;
      // Filtro de segurança: cada provedor tem o seu, então outro modelo pode aceitar o mesmo pedido
      if (e instanceof AiBlocked) blocked = e;
      errs.push(`${m}: ${(e as Error).message.slice(0, 120)}`);
      console.warn('[ia] modelo falhou, tentando o próximo:', m, (e as Error).message.slice(0, 200));
    }
  }
  if (blocked) throw blocked;
  throw new Error(`Nenhum modelo de IA respondeu agora (${models.length} tentados). Último erro: ${errs[errs.length - 1] || '—'}`);
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
  if (kind === 'text') {
    const usados = await textTokensThisMonth(clinicId);
    const teto = LIMITS[plan].tokensTextoIA;
    if (usados >= teto) {
      throw new QuotaError(`Limite mensal de uso da IA de texto atingido (${fmtMil(usados)} de ${fmtMil(teto)} tokens). Ele renova no dia 1º.`);
    }
  }
}

/** Início do mês no mesmo critério da função ai_usage_this_month do banco (date_trunc em UTC). */
export function monthStartUtc() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

/** Soma dos tokens de saída de texto da clínica no mês (no máximo algumas centenas de linhas por mês). */
export async function textTokensThisMonth(clinicId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.from('ai_usage').select('tokens_out')
    .eq('clinic_id', clinicId).eq('kind', 'text').gte('created_at', monthStartUtc()).limit(10_000);
  if (error) throw new Error(error.message);
  return (data || []).reduce((s, r) => s + (Number(r.tokens_out) || 0), 0);
}

const fmtMil = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi` : `${Math.round(n / 1000)} mil`;

async function logUsage(clinicId: string, kind: 'text' | 'image', feature: string, userId: string, tin: number, tout: number) {
  const admin = createAdminClient();
  await admin.from('ai_usage').insert({ clinic_id: clinicId, kind, feature, user_id: userId, tokens_in: tin, tokens_out: tout });
}

export interface AiCtx { clinicId: string; plan: Plan; userId: string; feature: string }

/** JSON no schema pedido. JSON quebrado também passa para o próximo modelo. */
export async function generateJson<T>(ctx: AiCtx, system: string, prompt: string, schema: object, temperature = 0.9): Promise<T> {
  await checkQuota(ctx.clinicId, ctx.plan, 'text');
  const deadline = Date.now() + BUDGET_MS;
  const { data, tin, tout } = await withFallback(TEXT_MODELS(), async (m) => {
    let raw: string, tin: number, tout: number;
    if (isOpenAI(m)) {
      ({ text: raw, tin, tout } = await openaiJson(m, system, prompt, schema, deadline));
    } else {
      const r = await callText(m, {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature, responseMimeType: 'application/json', responseSchema: schema, maxOutputTokens: MAX_TOKENS_POR_CHAMADA },
      }, deadline);
      raw = r.parts.map((p) => p.text || '').join(''); tin = r.tin; tout = r.tout;
    }
    const text = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
    try { return { data: JSON.parse(text) as T, tin, tout }; }
    catch { throw new Error(`${m}: JSON inválido`); }
  });
  await logUsage(ctx.clinicId, 'text', ctx.feature, ctx.userId, tin, tout);
  return data;
}

/**
 * Igual ao generateJson, mas NUNCA falha por indisponibilidade da IA: se nenhum modelo responder,
 * devolve o resultado de `offline()` (texto pronto, sem IA) com offline = true. Limite do plano e
 * bloqueio de segurança continuam sendo avisados, porque aí trocar de modelo não ajuda.
 */
export async function generateJsonOr<T>(ctx: AiCtx, system: string, prompt: string, schema: object, offline: () => T, temperature = 0.9): Promise<{ data: T; offline: boolean }> {
  try {
    return { data: await generateJson<T>(ctx, system, prompt, schema, temperature), offline: false };
  } catch (e) {
    if (e instanceof QuotaError || e instanceof AiBlocked) throw e;
    console.warn('[ia] usando o modelo pronto (sem IA):', (e as Error).message.slice(0, 200));
    return { data: offline(), offline: true };
  }
}

const IMAGEN_RATIO: Record<string, string> = { '4:5': '3:4', '9:16': '9:16', '1:1': '1:1' };

/** Gera uma imagem (base64). Usada só para fundos e cenários, nunca para rostos de pessoas reais. */
export async function generateImage(ctx: AiCtx, prompt: string, aspectRatio: '4:5' | '9:16' | '1:1'): Promise<{ mime: string; data: string }> {
  await checkQuota(ctx.clinicId, ctx.plan, 'image');
  const deadline = Date.now() + BUDGET_MS;
  const out = await withFallback(IMAGE_MODELS(), async (m) => {
    if (isOpenAI(m)) return openaiImage(m, prompt, aspectRatio, deadline);
    if (m.startsWith('imagen-')) {
      const j = (await call(m, 'predict', { instances: [{ prompt }], parameters: { sampleCount: 1, aspectRatio: IMAGEN_RATIO[aspectRatio] || '1:1', personGeneration: 'dont_allow' } }, deadline, PER_MODEL_IMAGE_MS)) as Record<string, unknown>;
      const p = ((j.predictions as { bytesBase64Encoded?: string; mimeType?: string }[] | undefined) || [])[0];
      if (!p?.bytesBase64Encoded) throw new NoImage(`${m}: sem imagem`);
      return { mime: p.mimeType || 'image/png', data: p.bytesBase64Encoded, tin: 0, tout: 0 };
    }
    const r = (await call(m, 'generateContent', {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio } },
    }, deadline, PER_MODEL_IMAGE_MS)) as CallOut;
    const img = r.parts.find((p) => p.inlineData?.data);
    if (!img?.inlineData) throw new NoImage(`${m}: sem imagem`);
    return { mime: img.inlineData.mimeType, data: img.inlineData.data, tin: r.tin, tout: r.tout };
  }).catch((e) => {
    if (e instanceof QuotaError || e instanceof AiBlocked || e instanceof AiTimeout) throw e;
    if ((e as Error).message === NO_KEYS) throw e;
    throw new Error('Nenhum modelo de imagem respondeu agora. A arte funciona sem o fundo de IA: escolha um modelo de arte com cor ou foto, ou tente o fundo de novo em alguns minutos.');
  });
  await logUsage(ctx.clinicId, 'image', ctx.feature, ctx.userId, out.tin, out.tout);
  return { mime: out.mime, data: out.data };
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
