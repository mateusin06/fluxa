'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getContext } from '@/lib/clinic';
import { localToIso } from '@/lib/utils';
import { checkFit, loadSchedule, nextFree } from '@/lib/schedule';

type S = { error?: string; ok?: string } | null;

const fmtHM = (ms: number) => new Date(ms - 3 * 3600000).toISOString().slice(11, 16);
const fmtDayHM = (ms: number) => { const x = new Date(ms - 3 * 3600000).toISOString(); return `${x.slice(8, 10)}/${x.slice(5, 7)} às ${x.slice(11, 16)}`; };
const money = (v: string | undefined) => {
  const t = String(v || '').trim().replace(/[R$\s]/g, '');
  if (!t) return null;
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN;
};

export async function createAppointment(_: S, fd: FormData): Promise<S> {
  const { supabase, clinic, user } = await getContext();
  const p = z.object({
    livre: z.string().optional(),
    encaixe: z.string().optional(),
    contact_id: z.string().uuid('Escolha o paciente').or(z.literal('')).optional(),
    professional_id: z.string().uuid().or(z.literal('')),
    procedure: z.string().max(120, 'Nome do procedimento muito longo').optional(),
    price: z.string().max(20).optional(),
    starts_at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Data e hora inválidas'),
    duration: z.coerce.number({ error: 'Duração inválida' }).int('Duração em minutos inteiros').min(5, 'Duração mínima de 5 minutos').max(600, 'Duração máxima de 600 minutos'),
    notes: z.string().max(1000).optional(),
  }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const d = p.data;
  const livre = d.livre === 'on';
  if (!livre && !d.contact_id) return { error: 'Escolha o paciente ou marque "Horário livre extra".' };

  // Procedimento: da lista (usa o cadastro) ou escrito à mão (guarda o texto e o preço informado)
  const name = (d.procedure || '').trim();
  let procId: string | null = null, procText: string | null = null, price: number | null = null;
  if (name) {
    const { data: list } = await supabase.from('procedures').select('id, name, price').eq('clinic_id', clinic.id).ilike('name', name).limit(1);
    if (list?.length) { procId = list[0].id; price = list[0].price === null ? null : Number(list[0].price); }
    else {
      procText = name;
      const v = money(d.price);
      if (Number.isNaN(v)) return { error: 'Preço inválido. Use só números, ex.: 250 ou 250,00.' };
      price = v;
    }
  }

  const start = localToIso(d.starts_at);
  const t0 = new Date(start).getTime(), t1 = t0 + d.duration * 60000;
  const end = new Date(t1).toISOString();
  if (d.professional_id) {
    const { data: clash } = await supabase.from('appointments').select('id').eq('clinic_id', clinic.id)
      .eq('professional_id', d.professional_id).not('status', 'in', '(cancelado,faltou,livre)')
      .lt('starts_at', end).gt('ends_at', start).limit(1);
    if (clash?.length) return { error: 'Esse profissional já tem consulta nesse horário.' };
  }

  let aviso = '';
  if (!livre) {
    const sc = await loadSchedule(supabase, clinic.id);
    const fit = await checkFit(supabase, clinic.id, sc, t0, t1);
    if (fit.full && d.encaixe !== 'on') {
      const b = fit.busy.sort((a, b) => a.start - b.start)[0];
      const prox = await nextFree(supabase, clinic.id, sc, { from: t0, durMin: d.duration, limit: 1 });
      return { error: `Esse horário já está ocupado (consulta das ${fmtHM(b.start)} às ${fmtHM(b.end)}).${prox.length ? ` Próximo horário livre para ${d.duration} min: ${fmtDayHM(prox[0])}.` : ''} Para agendar mesmo assim, marque "Encaixe".` };
    }
    if (sc.hours.length && !fit.inside) aviso = ' Atenção: fica fora do horário de atendimento.';
  }

  const { error } = await supabase.from('appointments').insert({
    clinic_id: clinic.id, contact_id: livre ? null : d.contact_id, status: livre ? 'livre' : 'agendado', professional_id: d.professional_id || null,
    procedure_id: procId, procedure_text: procText, price, starts_at: start, ends_at: end, notes: d.notes || null, created_by: user.id,
    meta: d.encaixe === 'on' ? { encaixe: 'sim' } : {},
  });
  if (error) return { error: error.message };
  revalidatePath('/app/agenda');
  return { ok: livre ? 'Horário livre extra criado. As automações oferecem ele a quem pedir pelo WhatsApp.' : `Consulta agendada (${d.duration} min, até ${fmtHM(t1)}).${aviso}` };
}

export async function setAppointmentStatus(fd: FormData) {
  const { supabase, clinic } = await getContext();
  const id = z.string().uuid().parse(fd.get('id'));
  const status = z.enum(['agendado', 'confirmado', 'remarcar', 'realizado', 'faltou', 'cancelado']).parse(fd.get('status'));
  // "pago" = já pagou; "balcao" = vai pagar no balcão (fica em aberto no Financeiro)
  const pay = z.enum(['', 'pago', 'balcao']).catch('').parse(fd.get('pagamento') || '');
  const { data } = await supabase.from('appointments').update({ status }).eq('id', id).eq('clinic_id', clinic.id).select('contact_id, starts_at').single();
  if (data?.contact_id && status === 'realizado') {
    await supabase.from('contacts').update({ last_visit_at: data.starts_at }).eq('id', data.contact_id);
    // a cobrança foi criada pelo banco ao marcar "realizado" (consulta com valor)
    if (pay === 'pago') await supabase.from('charges').update({ status: 'pago', paid_at: new Date().toISOString(), meta: { forma: 'pago na consulta' } }).eq('appointment_id', id).eq('status', 'aberto');
    if (pay === 'balcao') await supabase.from('charges').update({ meta: { forma: 'balcao' } }).eq('appointment_id', id).eq('status', 'aberto');
  }
  revalidatePath('/app/agenda');
  revalidatePath('/app/financeiro');
  revalidatePath('/app');
}

export async function markChargePaid(fd: FormData) {
  const { supabase, clinic } = await getContext();
  await supabase.from('charges').update({ status: 'pago', paid_at: new Date().toISOString() })
    .eq('id', z.string().uuid().parse(fd.get('id'))).eq('clinic_id', clinic.id).eq('status', 'aberto');
  revalidatePath('/app/agenda');
  revalidatePath('/app/financeiro');
  revalidatePath('/app');
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
