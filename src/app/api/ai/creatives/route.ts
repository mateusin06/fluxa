import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiContext, jsonError } from '@/lib/api-ctx';
import { generateJsonOr, complianceRules, QuotaError } from '@/lib/gemini';
import { creativesOffline } from '@/lib/ai-fallback';
import { clinicBrief, OBJECTIVES, type Objective } from '@/lib/marketing';

export const maxDuration = 120;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    variacoes: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          template: { type: 'STRING', enum: ['destaque', 'lateral', 'lista', 'autoridade', 'tipografico'] },
          paleta: { type: 'STRING', enum: ['marca', 'escuro', 'claro'] },
          headline: { type: 'STRING', description: 'Gancho principal, até 60 caracteres' },
          destaque: { type: 'STRING', description: 'Uma palavra ou expressão curta que aparece exatamente dentro do headline' },
          subtitulo: { type: 'STRING', description: 'Apoio, até 110 caracteres' },
          bullets: { type: 'ARRAY', items: { type: 'STRING' }, description: '0 a 4 itens de até 40 caracteres (use no template lista)' },
          cta: { type: 'STRING', description: 'Chamada para ação na arte, até 28 caracteres' },
          selo: { type: 'STRING', description: 'Selo curto opcional, até 22 caracteres, ou vazio' },
          fotoIndex: { type: 'INTEGER', description: 'Índice da foto a usar (0 = primeira), -1 se nenhuma' },
          texto_principal: { type: 'STRING', description: 'Texto principal do anúncio na Meta, 3 a 6 linhas curtas' },
          titulo: { type: 'STRING', description: 'Título do anúncio, até 40 caracteres' },
          descricao: { type: 'STRING', description: 'Descrição do anúncio, até 30 caracteres' },
          cta_meta: { type: 'STRING', enum: ['Enviar mensagem', 'Saiba mais', 'Agendar agora', 'Ligar agora'] },
          compliance: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Alertas de conformidade para a clínica revisar (pode ser vazio)' },
          cena: { type: 'STRING', description: 'Cenário da fotografia de fundo desta arte, em português, 15 a 40 palavras: ambiente, objetos, materiais, luz e cores. Sem pessoas, sem partes do corpo, sem texto, sem logotipos. Diferente em cada variação.' },
        },
        required: ['template', 'paleta', 'headline', 'destaque', 'subtitulo', 'bullets', 'cta', 'selo', 'fotoIndex', 'texto_principal', 'titulo', 'descricao', 'cta_meta', 'compliance', 'cena'],
      },
    },
  },
  required: ['variacoes'],
};

interface Var {
  template: string; paleta: 'marca' | 'escuro' | 'claro'; headline: string; destaque: string; subtitulo: string; bullets: string[];
  cta: string; selo: string; fotoIndex: number; texto_principal: string; titulo: string; descricao: string; cta_meta: string; compliance: string[];
  cena?: string;
}

export async function POST(req: Request) {
  const ctx = await apiContext();
  if ('error' in ctx) return ctx.error;
  const body = z.object({ briefId: z.string().uuid(), variacoes: z.number().int().min(1).max(5).default(3) }).safeParse(await req.json().catch(() => ({})));
  if (!body.success) return jsonError(new Error('Pedido inválido'), 400);
  const { supabase, clinic, user } = ctx;

  const { data: brief } = await supabase.from('creative_briefs').select('*').eq('id', body.data.briefId).eq('clinic_id', clinic.id).maybeSingle();
  if (!brief) return jsonError(new Error('Briefing não encontrado'), 404);
  const [{ data: pros }, { data: proc }] = await Promise.all([
    brief.professional_ids?.length
      ? supabase.from('professionals').select('id, name, specialty, registration, bio, photo_path').in('id', brief.professional_ids)
      : Promise.resolve({ data: [] as { id: string; name: string; specialty: string | null; registration: string | null; bio: string | null; photo_path: string | null }[] }),
    brief.procedure_id ? supabase.from('procedures').select('name, category').eq('id', brief.procedure_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const ordered = (brief.professional_ids as string[]).map((id) => (pros || []).find((p) => p.id === id)).filter(Boolean) as NonNullable<typeof pros>;
  const photos = [
    ...ordered.filter((p) => p.photo_path).map((p) => `Foto do(a) ${p.name}`),
    ...(brief.photo_paths as string[]).map((_, i) => `Foto enviada ${i + 1}`),
  ];

  const system = `Você é diretor(a) de criação e copywriter sênior de anúncios para clínicas no Brasil (Meta Ads: Instagram e Facebook).
Crie variações realmente diferentes entre si (ângulos diferentes: dor, desejo, autoridade, prova de cuidado, curiosidade).
O headline é o gancho que para a rolagem: concreto, curto, sem clichê.
O texto principal termina com convite claro para chamar no WhatsApp.
Toda arte recebe uma fotografia de fundo gerada por IA a partir do campo "cena": descreva um cenário publicitário sofisticado e moderno,
coerente com o procedimento e com a identidade da clínica (ex.: bancada de mármore claro com produtos de skincare e luz natural lateral;
consultório odontológico minimalista com cadeira branca, plantas e luz suave). Nunca pessoas, rostos, mãos, dentes ou pele em close, texto ou logotipos.
Regras obrigatórias:
${complianceRules(clinic.kind, { name: clinic.responsible_name, reg: clinic.responsible_reg })}`;

  const prompt = `${clinicBrief(clinic)}

BRIEFING
Título: ${brief.title}
Objetivo: ${OBJECTIVES[brief.objective as Objective] || brief.objective}
Procedimento: ${proc?.name || 'não especificado'}
Público: ${brief.audience || 'adultos da cidade e região'}
Tom de voz: ${brief.tone || 'acolhedor e confiante'}
Mensagem/condição que a clínica quer passar: ${brief.offer || '—'}
Direcionamento da clínica para as artes: ${brief.instructions || '—'}
Profissionais: ${ordered.map((p) => `${p.name}${p.specialty ? ' (' + p.specialty + ')' : ''}${p.registration ? ' ' + p.registration : ''}${p.bio ? ' — ' + p.bio : ''}`).join('; ') || 'não informados'}
Fotos disponíveis (use o índice em fotoIndex): ${photos.length ? photos.map((f, i) => `${i}=${f}`).join(', ') : 'nenhuma (fotoIndex -1; o fundo de IA ocupa o lugar da foto: prefira os templates tipografico, destaque, lista e lateral)'}

Gere exatamente ${body.data.variacoes} variações. Se houver foto de profissional, pelo menos uma variação usa o template autoridade.`;

  try {
    const { data: out, offline } = await generateJsonOr<{ variacoes: Var[] }>({ clinicId: clinic.id, plan: clinic.plan, userId: user.id, feature: 'criativos' }, system, prompt, SCHEMA,
      () => creativesOffline({ n: body.data.variacoes, clinic, procedimento: proc?.name, titulo: brief.title, oferta: brief.offer, profissional: ordered[0] || null, temFotoProf: !!ordered.find((p) => p.photo_path), fotos: photos.length }));
    const vars = (out.variacoes || []).slice(0, body.data.variacoes);
    const cenaPadrao = clinic.kind === 'odonto'
      ? 'consultório odontológico minimalista e moderno, cadeira branca, detalhes em madeira clara, plantas, luz natural suave pela janela'
      : 'bancada de mármore claro com frascos de skincare sem rótulo, folhas verdes, luz natural lateral suave, ambiente de spa sofisticado';
    const rows = vars.flatMap((v) => { const grupo = crypto.randomUUID(); return (brief.formats as string[]).map((format) => ({
      clinic_id: clinic.id, brief_id: brief.id, format,
      template: ['destaque', 'lateral', 'lista', 'autoridade', 'tipografico'].includes(v.template) ? v.template : 'destaque',
      content: {
        headline: v.headline.slice(0, 90), destaque: v.destaque.slice(0, 40), subtitulo: v.subtitulo.slice(0, 160),
        bullets: (v.bullets || []).slice(0, 4).map((b) => b.slice(0, 50)), cta: v.cta.slice(0, 32), selo: (v.selo || '').slice(0, 26),
        fotoIndex: photos.length ? Math.min(Math.max(v.fotoIndex ?? 0, 0), photos.length - 1) : -1, paleta: v.paleta || 'marca',
        cena: (v.cena || cenaPadrao).slice(0, 400), grupo, fundo: 'pendente' as const,
      },
      ad_copy: { texto_principal: v.texto_principal, titulo: v.titulo.slice(0, 60), descricao: v.descricao.slice(0, 40), cta: v.cta_meta },
      compliance: v.compliance || [],
    })); });
    const { error } = await supabase.from('creatives').insert(rows);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, total: rows.length, offline });
  } catch (e) {
    return jsonError(e, e instanceof QuotaError ? 429 : 500);
  }
}
