import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiContext, jsonError } from '@/lib/api-ctx';
import { generateJsonOr, complianceRules, QuotaError } from '@/lib/gemini';
import { campaignOffline } from '@/lib/ai-fallback';
import { clinicBrief, OBJECTIVES } from '@/lib/marketing';

export const maxDuration = 120;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    resumo: { type: 'STRING' },
    estrutura: { type: 'STRING', description: 'Ex.: 1 campanha, 1 conjunto, 5 anúncios' },
    objetivo_meta: { type: 'STRING', description: 'Objetivo e local de conversão no Gerenciador de Anúncios' },
    publico: {
      type: 'OBJECT',
      properties: { localizacao: { type: 'STRING' }, idade: { type: 'STRING' }, genero: { type: 'STRING' }, interesses: { type: 'STRING' }, observacao: { type: 'STRING' } },
      required: ['localizacao', 'idade', 'genero', 'interesses', 'observacao'],
    },
    orcamento: { type: 'STRING', description: 'Divisão do orçamento diário e por quanto tempo' },
    anuncios: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { nome: { type: 'STRING' }, angulo: { type: 'STRING' }, gancho: { type: 'STRING' }, texto_principal: { type: 'STRING' } }, required: ['nome', 'angulo', 'gancho', 'texto_principal'] },
    },
    mensagem_whatsapp: { type: 'STRING', description: 'Mensagem pré-preenchida do clique para o WhatsApp' },
    cronograma: { type: 'ARRAY', items: { type: 'STRING' }, description: 'O que fazer no dia 1, dia 3, dia 7, dia 14' },
    metricas: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Métricas a acompanhar com a regra de decisão de cada uma' },
    alertas: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['resumo', 'estrutura', 'objetivo_meta', 'publico', 'orcamento', 'anuncios', 'mensagem_whatsapp', 'cronograma', 'metricas', 'alertas'],
};

export async function POST(req: Request) {
  const ctx = await apiContext();
  if ('error' in ctx) return ctx.error;
  const b = z.object({
    nome: z.string().trim().min(2).max(80),
    objetivo: z.enum(Object.keys(OBJECTIVES) as [keyof typeof OBJECTIVES, ...(keyof typeof OBJECTIVES)[]]),
    orcamento: z.number().min(5).max(100000),
    raio: z.string().max(120).optional(),
    detalhes: z.string().max(800).optional(),
  }).safeParse(await req.json().catch(() => ({})));
  if (!b.success) return jsonError(new Error('Preencha nome, objetivo e orçamento'), 400);
  const { supabase, clinic, user } = ctx;
  const system = `Você é gestor(a) de tráfego especialista em Meta Ads para clínicas locais no Brasil.
Monte planos simples e executáveis por quem não é especialista, com números coerentes com o orçamento informado.
Nunca invente resultados garantidos; use estimativas como faixas e diga que são estimativas.
Regras dos textos:\n${complianceRules(clinic.kind, { name: clinic.responsible_name, reg: clinic.responsible_reg })}`;
  const prompt = `${clinicBrief(clinic)}\n\nCampanha: ${b.data.nome}\nObjetivo: ${OBJECTIVES[b.data.objetivo]}\nOrçamento diário: R$ ${b.data.orcamento}\nRegião: ${b.data.raio || 'cidade da clínica e raio de 10 km'}\nDetalhes: ${b.data.detalhes || '—'}\nPrefira campanhas de mensagens para o WhatsApp quando o objetivo for agendar.`;
  try {
    const { data: plan, offline } = await generateJsonOr<Record<string, unknown>>({ clinicId: clinic.id, plan: clinic.plan, userId: user.id, feature: 'campanha' }, system, prompt, SCHEMA,
      () => campaignOffline({ nome: b.data.nome, objetivo: b.data.objetivo, orcamento: b.data.orcamento, raio: b.data.raio, clinic }), 0.6);
    const { data, error } = await supabase.from('campaigns').insert({ clinic_id: clinic.id, name: b.data.nome, objective: b.data.objetivo, daily_budget: b.data.orcamento, plan, created_by: user.id }).select('id').single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ id: data.id, offline });
  } catch (e) {
    return jsonError(e, e instanceof QuotaError ? 429 : 500);
  }
}
