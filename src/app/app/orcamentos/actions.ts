'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getContext } from '@/lib/clinic';
import { METHOD_KEYS, parseMoney } from '@/lib/payments';

type S = { error?: string; ok?: string } | null;
const uuid = z.string().uuid();

const refresh = (id?: string, contactId?: string) => {
  revalidatePath('/app/orcamentos');
  if (id) revalidatePath(`/app/orcamentos/${id}`);
  if (contactId) revalidatePath(`/app/contatos/${contactId}`);
  revalidatePath('/app/financeiro'); revalidatePath('/app/crm'); revalidatePath('/app');
};

/** Novo orçamento (rascunho) para o paciente; abre o editor. */
export async function createQuote(_: S, fd: FormData): Promise<S> {
  const { supabase, clinic, user, writable } = await getContext();
  if (!writable) return { error: 'A conta está em modo leitura.' };
  const contact = uuid.safeParse(fd.get('contact_id'));
  if (!contact.success) return { error: 'Escolha o paciente' };
  const pro = String(fd.get('professional_id') || '');
  const valid = new Date(Date.now() - 3 * 3600000 + 15 * 86400000).toISOString().slice(0, 10);
  // liga à oportunidade aberta do paciente, se houver
  const { data: deal } = await supabase.from('deals').select('id').eq('contact_id', contact.data).eq('clinic_id', clinic.id).is('closed_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await supabase.from('quotes').insert({ clinic_id: clinic.id, contact_id: contact.data, professional_id: pro || null, deal_id: deal?.id || null, valid_until: valid, created_by: user.id }).select('id').single();
  if (error) return { error: error.message };
  redirect(`/app/orcamentos/${data.id}`);
}

const Item = z.object({
  procedure_id: z.string().uuid().or(z.literal('')).nullable().optional(),
  description: z.string().trim().min(1, 'Descreva cada item').max(160),
  region: z.string().trim().max(60).optional(),
  qty: z.coerce.number().int().min(1, 'Sessões: mínimo 1').max(99, 'Sessões: máximo 99'),
  unit_price: z.union([z.string(), z.number()]),
});

export async function saveQuote(input: {
  id: string; professional_id: string; discount: string; notes: string; valid_until: string;
  items: { procedure_id?: string | null; description: string; region?: string; qty: number | string; unit_price: string | number }[];
}): Promise<S> {
  const { supabase, clinic, writable } = await getContext();
  if (!writable) return { error: 'A conta está em modo leitura.' };
  const id = uuid.parse(input.id);
  const { data: q } = await supabase.from('quotes').select('id, status, contact_id').eq('id', id).eq('clinic_id', clinic.id).maybeSingle();
  if (!q) return { error: 'Orçamento não encontrado.' };
  if (!['rascunho', 'enviado'].includes(q.status)) return { error: `Orçamento ${q.status}: não dá para editar.` };
  if (!Array.isArray(input.items) || input.items.length > 60) return { error: 'Itens inválidos (máximo 60).' };
  const items = [];
  for (const [i, raw] of input.items.entries()) {
    const p = Item.safeParse(raw);
    if (!p.success) return { error: `Item ${i + 1}: ${p.error.issues[0].message}` };
    const price = parseMoney(p.data.unit_price);
    if (price === null || Number.isNaN(price)) return { error: `Item ${i + 1}: valor inválido.` };
    items.push({ clinic_id: clinic.id, quote_id: id, procedure_id: p.data.procedure_id || null, description: p.data.description, region: p.data.region || null, qty: p.data.qty, unit_price: price, position: i });
  }
  const discount = parseMoney(input.discount) ?? 0;
  if (Number.isNaN(discount)) return { error: 'Desconto inválido.' };
  const subtotal = items.reduce((a, i) => a + i.qty * i.unit_price, 0);
  if (discount > subtotal) return { error: 'O desconto é maior que o total.' };
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(input.valid_until) ? input.valid_until : null;
  const pro = input.professional_id && uuid.safeParse(input.professional_id).success ? input.professional_id : null;
  const { error: e1 } = await supabase.from('quotes').update({ professional_id: pro, discount, notes: (input.notes || '').slice(0, 2000) || null, valid_until: valid }).eq('id', id);
  if (e1) return { error: e1.message };
  const { error: e2 } = await supabase.from('quote_items').delete().eq('quote_id', id);
  if (e2) return { error: e2.message };
  if (items.length) {
    const { error: e3 } = await supabase.from('quote_items').insert(items);
    if (e3) return { error: e3.message };
  }
  refresh(id, q.contact_id);
  return { ok: 'Orçamento salvo.' };
}

export async function markQuoteSent(id: string) {
  const { supabase, clinic } = await getContext();
  const { data: q } = await supabase.from('quotes').update({ status: 'enviado', sent_at: new Date().toISOString() }).eq('id', uuid.parse(id)).eq('clinic_id', clinic.id).eq('status', 'rascunho').select('contact_id, number').maybeSingle();
  if (q) await supabase.from('activities').insert({ clinic_id: clinic.id, contact_id: q.contact_id, type: 'whatsapp', body: `Orçamento nº ${q.number} enviado ao paciente.` });
  // move a oportunidade para "Orçamento enviado", se a etapa existir
  if (q) {
    const { data: qq } = await supabase.from('quotes').select('deal_id').eq('id', id).maybeSingle();
    const { data: st } = await supabase.from('stages').select('id').eq('clinic_id', clinic.id).eq('kind', 'open').ilike('name', '%orçamento%').limit(1).maybeSingle();
    if (qq?.deal_id && st) await supabase.from('deals').update({ stage_id: st.id }).eq('id', qq.deal_id).is('closed_at', null);
  }
  refresh(id, q?.contact_id);
}

export async function approveQuote(_: S, fd: FormData): Promise<S> {
  const { supabase, clinic, writable } = await getContext();
  if (!writable) return { error: 'A conta está em modo leitura.' };
  const p = z.object({
    id: z.string().uuid(),
    method: z.enum(METHOD_KEYS),
    installments: z.coerce.number().int().min(1).max(24),
    first_due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data da 1ª parcela inválida'),
    first_paid: z.string().optional(),
  }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const { data: q } = await supabase.from('quotes').select('contact_id').eq('id', p.data.id).eq('clinic_id', clinic.id).maybeSingle();
  if (!q) return { error: 'Orçamento não encontrado.' };
  const { count } = await supabase.from('quote_items').select('id', { count: 'exact', head: true }).eq('quote_id', p.data.id);
  if (!count) return { error: 'Adicione pelo menos um item antes de aprovar.' };
  const { error } = await supabase.rpc('approve_quote', { p_quote: p.data.id, p_method: p.data.method, p_installments: p.data.installments, p_first_due: p.data.first_due, p_first_paid: p.data.first_paid === 'on' });
  if (error) return { error: error.message };
  refresh(p.data.id, q.contact_id);
  return { ok: 'Aprovado. As parcelas estão no Financeiro e as sessões ficam na ficha do paciente para agendar.' };
}

export async function refuseQuote(fd: FormData) {
  const { supabase, clinic } = await getContext();
  const id = uuid.parse(fd.get('id'));
  const reason = String(fd.get('reason') || '').slice(0, 300) || null;
  const { data: q } = await supabase.from('quotes').update({ status: 'recusado', refused_reason: reason }).eq('id', id).eq('clinic_id', clinic.id).in('status', ['rascunho', 'enviado']).select('contact_id, deal_id, number').maybeSingle();
  if (q?.deal_id) {
    const { data: lost } = await supabase.from('stages').select('id').eq('clinic_id', clinic.id).eq('kind', 'lost').order('position').limit(1).maybeSingle();
    if (lost) await supabase.from('deals').update({ stage_id: lost.id, lost_reason: reason || 'Orçamento recusado' }).eq('id', q.deal_id).is('closed_at', null);
  }
  if (q) await supabase.from('activities').insert({ clinic_id: clinic.id, contact_id: q.contact_id, type: 'sistema', body: `Orçamento nº ${q.number} recusado${reason ? ': ' + reason : ''}.` });
  refresh(id, q?.contact_id);
}

export async function reopenQuote(fd: FormData) {
  const { supabase, clinic } = await getContext();
  const id = uuid.parse(fd.get('id'));
  const { data: q } = await supabase.from('quotes').update({ status: 'rascunho', refused_reason: null }).eq('id', id).eq('clinic_id', clinic.id).eq('status', 'recusado').select('contact_id').maybeSingle();
  refresh(id, q?.contact_id);
}

export async function deleteQuote(fd: FormData) {
  const { supabase, clinic } = await getContext();
  const id = uuid.parse(fd.get('id'));
  await supabase.from('quotes').delete().eq('id', id).eq('clinic_id', clinic.id).in('status', ['rascunho', 'recusado']);
  refresh();
  redirect('/app/orcamentos');
}
