import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiContext, jsonError } from '@/lib/api-ctx';
import { generateJsonOr, complianceRules, QuotaError } from '@/lib/gemini';
import { copiesOffline } from '@/lib/ai-fallback';
import { clinicBrief, VOSS } from '@/lib/marketing';

export const maxDuration = 120;

const KINDS = {
  anuncio: 'Textos de anúncio para Meta Ads (texto principal, título e descrição)',
  legenda: 'Legendas de post para o Instagram, com sugestão de hashtags locais',
  whatsapp: 'Mensagens de WhatsApp para pacientes (curtas, humanas, com pergunta no final)',
  google: 'Postagens para o Perfil da Empresa no Google',
  roteiro_video: 'Roteiros de Reels de 15 a 30 segundos (cena a cena, com fala e texto na tela)',
} as const;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    itens: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          titulo: { type: 'STRING', description: 'Nome curto da variação (ângulo usado)' },
          texto: { type: 'STRING', description: 'O conteúdo pronto para copiar' },
          extra: { type: 'STRING', description: 'Título do anúncio, hashtags ou observação, conforme o tipo; pode ser vazio' },
        },
        required: ['titulo', 'texto', 'extra'],
      },
    },
    alertas: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['itens', 'alertas'],
};

export async function POST(req: Request) {
  const ctx = await apiContext();
  if ('error' in ctx) return ctx.error;
  const b = z.object({
    kind: z.enum(Object.keys(KINDS) as [keyof typeof KINDS, ...(keyof typeof KINDS)[]]),
    topic: z.string().trim().min(3).max(500),
    tone: z.string().max(80).optional(),
    qtd: z.number().int().min(1).max(6).default(3),
  }).safeParse(await req.json().catch(() => ({})));
  if (!b.success) return jsonError(new Error('Preencha o tema'), 400);
  const { supabase, clinic, user } = ctx;
  const system = `Você é copywriter sênior de marketing para clínicas no Brasil.\n${b.data.kind === 'whatsapp' ? VOSS + '\n' : ''}Regras obrigatórias:\n${complianceRules(clinic.kind, { name: clinic.responsible_name, reg: clinic.responsible_reg })}`;
  const prompt = `${clinicBrief(clinic)}\n\nTipo: ${KINDS[b.data.kind]}\nTema: ${b.data.topic}\nTom: ${b.data.tone || 'acolhedor e confiante'}\nGere ${b.data.qtd} variações com ângulos diferentes.`;
  try {
    const { data: out, offline } = await generateJsonOr<{ itens: { titulo: string; texto: string; extra: string }[]; alertas: string[] }>(
      { clinicId: clinic.id, plan: clinic.plan, userId: user.id, feature: 'textos' }, system, prompt, SCHEMA, () => copiesOffline(b.data.kind, b.data.topic, b.data.qtd, clinic));
    const { data, error } = await supabase.from('copies').insert({ clinic_id: clinic.id, kind: b.data.kind, topic: b.data.topic, content: out, created_by: user.id }).select('id').single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ id: data.id, ...out, offline });
  } catch (e) {
    return jsonError(e, e instanceof QuotaError ? 429 : 500);
  }
}
