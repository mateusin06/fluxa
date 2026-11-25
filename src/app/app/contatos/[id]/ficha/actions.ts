'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getContext } from '@/lib/clinic';
import { ANAMNESE_FLAGS, ANAMNESE_TEXTS } from '@/lib/anamnese';

type S = { error?: string; ok?: string } | null;
const uuid = z.string().uuid();

/** Só quem tem acesso à ficha clínica (o banco também confere). */
async function clinicalCtx() {
  const ctx = await getContext();
  const { data } = await ctx.supabase.from('memberships').select('role, clinical_access').eq('clinic_id', ctx.clinic.id).eq('user_id', ctx.user.id).maybeSingle();
  if (!(data?.role === 'owner' || data?.clinical_access)) throw new Error('Sem acesso à ficha clínica. Peça ao dono da clínica em Clínica e equipe.');
  if (!ctx.writable) throw new Error('A conta está em modo leitura.');
  return ctx;
}


export async function saveAnamnese(_: S, fd: FormData): Promise<S> {
  try {
    const { supabase, clinic, user } = await clinicalCtx();
    const cid = uuid.parse(fd.get('contact_id'));
    const data: Record<string, string | boolean> = {};
    for (const [k] of ANAMNESE_TEXTS) { const v = String(fd.get(k) || '').trim().slice(0, 2000); if (v) data[k] = v; }
    for (const [k] of ANAMNESE_FLAGS) if (fd.get(k) === 'on') data[k] = true;
    const { error } = await supabase.from('anamneses').upsert({ contact_id: cid, clinic_id: clinic.id, data, updated_by: user.id, updated_at: new Date().toISOString() });
    if (error) return { error: error.message };
    revalidatePath(`/app/contatos/${cid}/ficha`); revalidatePath(`/app/contatos/${cid}`);
    return { ok: 'Anamnese salva.' };
  } catch (e) { return { error: (e as Error).message }; }
}

export async function addClinicalNote(_: S, fd: FormData): Promise<S> {
  try {
    const { supabase, clinic, user } = await clinicalCtx();
    const p = z.object({
      contact_id: uuid, body: z.string().trim().min(3, 'Escreva a evolução').max(5000),
      professional_id: uuid.or(z.literal('')).optional(), appointment_id: uuid.or(z.literal('')).optional(),
    }).safeParse(Object.fromEntries(fd));
    if (!p.success) return { error: p.error.issues[0].message };
    const { error } = await supabase.from('clinical_notes').insert({ clinic_id: clinic.id, contact_id: p.data.contact_id, body: p.data.body, professional_id: p.data.professional_id || null, appointment_id: p.data.appointment_id || null, created_by: user.id });
    if (error) return { error: error.message };
    revalidatePath(`/app/contatos/${p.data.contact_id}/ficha`);
    return { ok: 'Evolução registrada.' };
  } catch (e) { return { error: (e as Error).message }; }
}

export async function registerPatientFile(input: { contact_id: string; path: string; caption?: string; taken_at?: string }): Promise<S> {
  try {
    const { supabase, clinic, user } = await clinicalCtx();
    const cid = uuid.parse(input.contact_id);
    const path = z.string().regex(new RegExp(`^${clinic.id}/pacientes/${cid}/[0-9a-f-]{36}\\.(png|jpg|jpeg|webp)$`)).parse(input.path);
    const taken = input.taken_at && /^\d{4}-\d{2}-\d{2}$/.test(input.taken_at) ? input.taken_at : null;
    const { error } = await supabase.from('patient_files').insert({ clinic_id: clinic.id, contact_id: cid, path, caption: (input.caption || '').slice(0, 200) || null, taken_at: taken, created_by: user.id });
    if (error) return { error: error.message };
    revalidatePath(`/app/contatos/${cid}/ficha`);
    return { ok: 'Foto salva.' };
  } catch (e) { return { error: (e as Error).message }; }
}

export async function deletePatientFile(fd: FormData) {
  const { supabase, clinic } = await clinicalCtx();
  const id = uuid.parse(fd.get('id'));
  const { data } = await supabase.from('patient_files').delete().eq('id', id).eq('clinic_id', clinic.id).select('path, contact_id').maybeSingle();
  if (data) {
    await supabase.storage.from('clinic-files').remove([data.path]);
    revalidatePath(`/app/contatos/${data.contact_id}/ficha`);
  }
}
