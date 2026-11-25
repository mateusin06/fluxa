'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getContext } from '@/lib/clinic';
import { localToIso } from '@/lib/utils';

type S = { error?: string; ok?: string } | null;

export async function createAppointment(_: S, fd: FormData): Promise<S> {
  const { supabase, clinic, user } = await getContext();
  const p = z.object({
    livre: z.string().optional(),
    contact_id: z.string().uuid('Escolha o paciente').or(z.literal('')),
    professional_id: z.string().uuid().or(z.literal('')),
    procedure_id: z.string().uuid().or(z.literal('')),
    starts_at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Data e hora inválidas'),
    duration: z.coerce.number().int().min(5).max(600),
    notes: z.string().max(1000).optional(),
  }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const livre = p.data.livre === 'on';
  if (!livre && !p.data.contact_id) return { error: 'Escolha o paciente ou marque "Horário livre".' };
  const start = localToIso(p.data.starts_at);
  const end = new Date(new Date(start).getTime() + p.data.duration * 60000).toISOString();
  if (p.data.professional_id) {
    const { data: clash } = await supabase.from('appointments').select('id').eq('clinic_id', clinic.id)
      .eq('professional_id', p.data.professional_id).not('status', 'in', '(cancelado,faltou)')
      .lt('starts_at', end).gt('ends_at', start).limit(1);
    if (clash?.length) return { error: 'Esse profissional já tem consulta nesse horário.' };
  }
  const { error } = await supabase.from('appointments').insert({
    clinic_id: clinic.id, contact_id: livre ? null : p.data.contact_id, status: livre ? 'livre' : 'agendado', professional_id: p.data.professional_id || null,
    procedure_id: p.data.procedure_id || null, starts_at: start, ends_at: end, notes: p.data.notes || null, created_by: user.id,
  });
  if (error) return { error: error.message };
  revalidatePath('/app/agenda');
  return { ok: livre ? 'Horário livre criado. As automações oferecem ele a quem chamar pelo anúncio.' : 'Consulta agendada.' };
}

export async function setAppointmentStatus(fd: FormData) {
  const { supabase, clinic } = await getContext();
  const id = z.string().uuid().parse(fd.get('id'));
  const status = z.enum(['agendado', 'confirmado', 'remarcar', 'realizado', 'faltou', 'cancelado']).parse(fd.get('status'));
  const { data } = await supabase.from('appointments').update({ status }).eq('id', id).eq('clinic_id', clinic.id).select('contact_id, starts_at').single();
  if (data?.contact_id && status === 'realizado') await supabase.from('contacts').update({ last_visit_at: data.starts_at }).eq('id', data.contact_id);
  revalidatePath('/app/agenda');
}

export async function addWaitlist(_: S, fd: FormData): Promise<S> {
  const { supabase, clinic } = await getContext();
  const contact = z.string().uuid().safeParse(fd.get('contact_id'));
  if (!contact.success) return { error: 'Escolha o paciente' };
  const procId = String(fd.get('procedure_id') || '');
  const { error } = await supabase.from('waitlist').insert({ clinic_id: clinic.id, contact_id: contact.data, procedure_id: procId || null });
  if (error) return { error: error.message };
  revalidatePath('/app/agenda');
  return { ok: 'Paciente na lista de espera.' };
}

export async function setWaitlistStatus(fd: FormData) {
  const { supabase, clinic } = await getContext();
  await supabase.from('waitlist').update({ status: z.enum(['aguardando', 'ofertado', 'agendado', 'cancelado']).parse(fd.get('status')) })
    .eq('id', z.string().uuid().parse(fd.get('id'))).eq('clinic_id', clinic.id);
  revalidatePath('/app/agenda');
}
