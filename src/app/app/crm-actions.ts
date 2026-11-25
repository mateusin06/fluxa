'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getContext } from '@/lib/clinic';
import { localToIso, normPhone } from '@/lib/utils';

type S = { error?: string; ok?: string } | null;
const uuid = z.string().uuid();
const blank = (v: FormDataEntryValue | null) => { const s = String(v ?? '').trim(); return s || null; };

export async function createContact(_: S, fd: FormData): Promise<S> {
  const { supabase, clinic, user } = await getContext();
  const name = blank(fd.get('name'));
  if (!name) return { error: 'Informe o nome' };
  const rawPhone = blank(fd.get('phone'));
  const phone = rawPhone ? normPhone(rawPhone) : null;
  if (rawPhone && !phone) return { error: 'Telefone inválido. Use DDD + número.' };
  if (phone) {
    const { data: dup } = await supabase.from('contacts').select('id').eq('clinic_id', clinic.id).eq('phone', phone).maybeSingle();
    if (dup) return { error: 'Já existe um contato com esse telefone.' };
  }
  const { data: c, error } = await supabase.from('contacts').insert({
    clinic_id: clinic.id, name, phone, email: blank(fd.get('email')), source: blank(fd.get('source')) || 'manual',
    birth_date: blank(fd.get('birth_date')), notes: blank(fd.get('notes')), created_by: user.id,
  }).select('id').single();
  if (error) return { error: error.message };
  if (fd.get('criar_oportunidade') === 'on') {
    const { data: st } = await supabase.from('stages').select('id').eq('clinic_id', clinic.id).eq('kind', 'open').order('position').limit(1).single();
    const procId = blank(fd.get('procedure_id'));
    let title = 'Avaliação';
    if (procId) {
      const { data: pr } = await supabase.from('procedures').select('name').eq('id', procId).single();
      title = pr?.name || title;
    }
    if (st) await supabase.from('deals').insert({ clinic_id: clinic.id, contact_id: c.id, stage_id: st.id, procedure_id: procId, title, value: Number(fd.get('value') || 0), owner_id: user.id });
  }
  revalidatePath('/app/contatos'); revalidatePath('/app/crm');
  redirect(`/app/contatos/${c.id}`);
}

export async function updateContact(_: S, fd: FormData): Promise<S> {
  const { supabase, clinic } = await getContext();
  const id = uuid.parse(fd.get('id'));
  const rawPhone = blank(fd.get('phone'));
  const phone = rawPhone ? normPhone(rawPhone) : null;
  if (rawPhone && !phone) return { error: 'Telefone inválido' };
  const tags = String(fd.get('tags') || '').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 20);
  const { error } = await supabase.from('contacts').update({
    name: blank(fd.get('name')) || 'Sem nome', phone, email: blank(fd.get('email')), birth_date: blank(fd.get('birth_date')),
    source: blank(fd.get('source')) || 'manual', notes: blank(fd.get('notes')), tags, consent_whatsapp: fd.get('consent_whatsapp') === 'on',
  }).eq('id', id).eq('clinic_id', clinic.id);
  if (error) return { error: error.message };
  revalidatePath(`/app/contatos/${id}`);
  return { ok: 'Salvo.' };
}

export async function deleteContact(fd: FormData) {
  const { supabase, clinic, isAdmin } = await getContext();
  if (!isAdmin) return;
  const id = uuid.parse(fd.get('id'));
  await supabase.from('contacts').delete().eq('id', id).eq('clinic_id', clinic.id);
  revalidatePath('/app/contatos'); revalidatePath('/app/crm');
  redirect('/app/contatos');
}

export async function createDeal(_: S, fd: FormData): Promise<S> {
  const { supabase, clinic, user } = await getContext();
  const contactId = uuid.safeParse(fd.get('contact_id'));
  if (!contactId.success) return { error: 'Escolha o contato' };
  const stageId = blank(fd.get('stage_id'));
  let st = stageId;
  if (!st) {
    const { data } = await supabase.from('stages').select('id').eq('clinic_id', clinic.id).eq('kind', 'open').order('position').limit(1).single();
    st = data?.id || null;
  }
  if (!st) return { error: 'Funil sem etapas' };
  const { error } = await supabase.from('deals').insert({
    clinic_id: clinic.id, contact_id: contactId.data, stage_id: st, title: blank(fd.get('title')) || 'Oportunidade',
    value: Number(String(fd.get('value') || '0').replace(',', '.')) || 0, procedure_id: blank(fd.get('procedure_id')), owner_id: user.id,
    expected_close: blank(fd.get('expected_close')),
  });
  if (error) return { error: error.message };
  revalidatePath('/app/crm'); revalidatePath(`/app/contatos/${contactId.data}`);
  return { ok: 'Oportunidade criada.' };
}

export async function moveDeal(dealId: string, stageId: string, position: number, lostReason?: string) {
  const { supabase, clinic } = await getContext();
  const p = z.object({ dealId: uuid, stageId: uuid, position: z.number().finite() }).parse({ dealId, stageId, position });
  const patch: Record<string, unknown> = { stage_id: p.stageId, position: p.position };
  if (lostReason !== undefined) patch.lost_reason = lostReason.slice(0, 300);
  const { error } = await supabase.from('deals').update(patch).eq('id', p.dealId).eq('clinic_id', clinic.id);
  if (error) return { error: error.message };
  revalidatePath('/app/crm');
  return { ok: true };
}

export async function updateDeal(_: S, fd: FormData): Promise<S> {
  const { supabase, clinic } = await getContext();
  const id = uuid.parse(fd.get('id'));
  const { error } = await supabase.from('deals').update({
    title: blank(fd.get('title')) || 'Oportunidade', value: Number(String(fd.get('value') || '0').replace(',', '.')) || 0,
    stage_id: uuid.parse(fd.get('stage_id')), lost_reason: blank(fd.get('lost_reason')),
  }).eq('id', id).eq('clinic_id', clinic.id);
  if (error) return { error: error.message };
  revalidatePath('/app/crm'); revalidatePath(`/app/contatos/${fd.get('contact_id')}`);
  return { ok: 'Atualizado.' };
}

export async function addActivity(_: S, fd: FormData): Promise<S> {
  const { supabase, clinic, user } = await getContext();
  const contactId = uuid.parse(fd.get('contact_id'));
  const type = z.enum(['nota', 'ligacao', 'whatsapp', 'email', 'tarefa']).parse(fd.get('type'));
  const body = blank(fd.get('body'));
  if (!body) return { error: 'Escreva o texto' };
  const due = blank(fd.get('due_at'));
  const { error } = await supabase.from('activities').insert({
    clinic_id: clinic.id, contact_id: contactId, type, body: body.slice(0, 4000), user_id: user.id,
    due_at: type === 'tarefa' && due ? localToIso(due) : null,
  });
  if (error) return { error: error.message };
  if (type !== 'tarefa') await supabase.from('contacts').update({ updated_at: new Date().toISOString() }).eq('id', contactId);
  revalidatePath(`/app/contatos/${contactId}`);
  return { ok: 'Registrado.' };
}

export async function completeTask(fd: FormData) {
  const { supabase, clinic } = await getContext();
  const id = uuid.parse(fd.get('id'));
  await supabase.from('activities').update({ done_at: new Date().toISOString() }).eq('id', id).eq('clinic_id', clinic.id);
  revalidatePath(`/app/contatos/${fd.get('contact_id')}`); revalidatePath('/app');
}
