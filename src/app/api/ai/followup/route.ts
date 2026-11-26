import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiContext, jsonError } from '@/lib/api-ctx';
import { generateJsonOr, QuotaError } from '@/lib/gemini';
import { followupOffline } from '@/lib/ai-fallback';
import { VOSS } from '@/lib/marketing';
import { firstName } from '@/lib/utils';

export const maxDuration = 120;
const SCHEMA = {
  type: 'OBJECT',
  properties: { mensagens: { type: 'ARRAY', items: { type: 'OBJECT', properties: { abordagem: { type: 'STRING' }, texto: { type: 'STRING' } }, required: ['abordagem', 'texto'] } } },
  required: ['mensagens'],
};

export async function POST(req: Request) {
  const ctx = await apiContext();
  if ('error' in ctx) return ctx.error;
  const b = z.object({ contactId: z.string().uuid(), goal: z.string().max(60) }).safeParse(await req.json().catch(() => ({})));
  if (!b.success) return jsonError(new Error('Pedido inválido'), 400);
  const { supabase, clinic, user } = ctx;
  const { data: c } = await supabase.from('contacts').select('name, source, notes, created_at').eq('id', b.data.contactId).eq('clinic_id', clinic.id).maybeSingle();
  if (!c) return jsonError(new Error('Contato não encontrado'), 404);
  const [{ data: acts }, { data: deals }] = await Promise.all([
    supabase.from('activities').select('type, body, created_at').eq('contact_id', b.data.contactId).order('created_at', { ascending: false }).limit(15),
    supabase.from('deals').select('title, value, stage:stages(name)').eq('contact_id', b.data.contactId),
  ]);
  const hist = (acts || []).reverse().map((a) => `${a.created_at.slice(0, 10)} [${a.type}] ${a.body}`).join('\n');
  const system = `Você escreve mensagens de WhatsApp para a recepção de uma clínica ${clinic.kind === 'odonto' ? 'odontológica' : 'de estética'} (${clinic.name}).\n${VOSS}\nNunca cite preços, descontos ou resultados garantidos. Até 400 caracteres por mensagem. Assine apenas com o primeiro nome da clínica se fizer sentido.`;
  const prompt = `Contato: ${firstName(c.name)} (origem: ${c.source}; desde ${c.created_at.slice(0, 10)})\nObservações: ${c.notes || '—'}\nOportunidades: ${(deals || []).map((d) => `${d.title} em "${(d.stage as unknown as { name: string } | null)?.name}"`).join('; ') || 'nenhuma'}\nHistórico:\n${hist || 'sem registros'}\n\nObjetivo agora: ${b.data.goal}. Gere 2 mensagens com abordagens diferentes.`;
  try {
    const { data: out, offline } = await generateJsonOr<{ mensagens: { abordagem: string; texto: string }[] }>({ clinicId: clinic.id, plan: clinic.plan, userId: user.id, feature: 'followup' }, system, prompt, SCHEMA, () => followupOffline(firstName(c.name), b.data.goal), 0.8);
    return NextResponse.json({ ...out, offline });
  } catch (e) {
    return jsonError(e, e instanceof QuotaError ? 429 : 500);
  }
}
