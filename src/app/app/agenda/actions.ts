'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getContext } from '@/lib/clinic';
import { localToIso } from '@/lib/utils';
import { checkFit, freePro, loadSchedule, nextFreePro } from '@/lib/schedule';
import { notifyWaitlist } from '@/lib/waitlist';
import { METHOD_KEYS, parseMoney } from '@/lib/payments';

type S = { error?: string; ok?: string } | null;

const fmtHM = (ms: number) => new Date(ms - 3 * 3600000).toISOString().slice(11, 16);
const fmtDayHM = (ms: number) => { const x = new Date(ms - 3 * 3600000).toISOString(); return `${x.slice(8, 10)}/${x.slice(5, 7)} às ${x.slice(11, 16)}`; };
const money = (v: string | undefined) => parseMoney(v);

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
    quote_item_id: z.string().uuid().or(z.literal('')).optional(),
  }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const d = p.data;
  const livre = d.livre === 'on';
  if (!livre && !d.contact_id) return { error: 'Escolha o paciente ou marque "Horário livre extra".' };

  // Sessão de um plano de tratamento aprovado: já foi cobrada no orçamento, não cobra de novo
  let planItem: { id: string; procedure_id: string | null; description: string } | null = null;
  if (d.quote_item_id) {
    if (!d.contact_id) return { error: 'Escolha o paciente do plano.' };
    const { data: it } = await supabase.from('quote_items').select('id, procedure_id, description, quote:quotes!inner(status, contact_id)').eq('id', d.quote_item_id).eq('clinic_id', clinic.id).maybeSingle();
    const q = it?.quote as unknown as { status: string; contact_id: string } | undefined;
    if (!it || q?.status !== 'aprovado' || q.contact_id !== d.contact_id) return { error: 'Item do plano não encontrado (o orçamento precisa estar aprovado e ser deste paciente).' };
    planItem = { id: it.id, procedure_id: it.procedure_id, description: it.description };
  }

  // Procedimento: da lista (usa o cadastro) ou escrito à mão (guarda o texto e o preço informado)
  const name = (d.procedure || '').trim();
  let procId: string | null = null, procText: string | null = null, price: number | null = null;
  if (planItem) {
    procId = planItem.procedure_id; procText = procId ? null : planItem.description.slice(0, 120);
  } else if (name) {
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

  let aviso = '', proId = d.professional_id || null, proName = '';
  if (!livre) {
    const sc = await loadSchedule(supabase, clinic.id);
    // sem profissional escolhido: o sistema escolhe o primeiro livre que faz o procedimento
    if (!proId && sc.pros.length) {
      const p = await freePro(supabase, clinic.id, sc, t0, t1, procId);
      if (p) { proId = p.id; proName = p.name; }
      else if (d.encaixe !== 'on') {
        const prox = await nextFreePro(supabase, clinic.id, sc, { from: t0, durMin: d.duration, procId, limit: 1 });
        return { error: `Nenhum profissional livre nesse horário.${prox.length ? ` Próximo horário livre para ${d.duration} min: ${fmtDayHM(prox[0].t)} (${sc.pros.find((x) => x.id === prox[0].pro)?.name || ''}).` : ''} Para agendar mesmo assim, marque "Encaixe".` };
      }
    }
    const fit = await checkFit(supabase, clinic.id, sc, t0, t1, { proId });
    if (fit.proBusy) {
      const prox = await nextFreePro(supabase, clinic.id, sc, { from: t0, durMin: d.duration, proId, limit: 1 });
      const b = fit.busy.filter((x) => x.pro === proId).sort((a, b) => a.start - b.start)[0];
      return { error: `Esse profissional já tem consulta das ${fmtHM(b.start)} às ${fmtHM(b.end)}.${prox.length ? ` Próximo horário livre dele para ${d.duration} min: ${fmtDayHM(prox[0].t)}.` : ''}` };
    }
    if (fit.full && d.encaixe !== 'on') {
      const b = fit.busy.sort((a, b) => a.start - b.start)[0];
      const prox = await nextFreePro(supabase, clinic.id, sc, { from: t0, durMin: d.duration, procId, proId, limit: 1 });
      return { error: `Esse horário já está ocupado (consulta das ${fmtHM(b.start)} às ${fmtHM(b.end)}).${prox.length ? ` Próximo horário livre para ${d.duration} min: ${fmtDayHM(prox[0].t)}.` : ''} Para agendar mesmo assim, marque "Encaixe".` };
    }
    if (sc.hasHours && !fit.inside) aviso = proId && sc.pros.some((x) => x.id === proId) ? ' Atenção: fica fora do horário desse profissional.' : ' Atenção: fica fora do horário de atendimento.';
    if (proId && !proName) proName = sc.pros.find((x) => x.id === proId)?.name || '';
  }

  const { error } = await supabase.from('appointments').insert({
    clinic_id: clinic.id, contact_id: livre ? null : d.contact_id, status: livre ? 'livre' : 'agendado', professional_id: proId,
    procedure_id: procId, procedure_text: procText, price: planItem ? null : price, quote_item_id: planItem?.id || null,
    starts_at: start, ends_at: end, notes: d.notes || null, created_by: user.id,
    meta: { ...(d.encaixe === 'on' ? { encaixe: 'sim' } : {}), ...(planItem ? { plano: 'sim' } : {}) },
  });
  if (error) return { error: error.message };
  revalidatePath('/app/agenda');
  if (d.contact_id) revalidatePath(`/app/contatos/${d.contact_id}`);
  return { ok: livre ? 'Horário livre extra criado. As automações oferecem ele a quem pedir pelo WhatsApp.' : `Consulta agendada (${d.duration} min, até ${fmtHM(t1)}${proName ? `, com ${proName}` : ''}).${planItem ? ' Sessão do plano: já cobrada no orçamento.' : ''}${aviso}` };
}

const payFields = (fd: FormData) => ({
  method: z.enum(METHOD_KEYS).catch('pix').parse(fd.get('forma') || 'pix'),
  installments: Math.min(24, Math.max(1, Number(fd.get('parcelas')) || 1)),
});

export async function setAppointmentStatus(fd: FormData) {
  const { supabase, clinic } = await getContext();
  const id = z.string().uuid().parse(fd.get('id'));
  const status = z.enum(['agendado', 'confirmado', 'remarcar', 'realizado', 'faltou', 'cancelado']).parse(fd.get('status'));
  // "pago" = já pagou (com a forma); "balcao" = vai pagar no balcão (fica em aberto no Financeiro)
  const pay = z.enum(['', 'pago', 'balcao']).catch('').parse(fd.get('pagamento') || '');
  const { data: before } = await supabase.from('appointments').select('status').eq('id', id).eq('clinic_id', clinic.id).maybeSingle();
  const { data } = await supabase.from('appointments').update({ status }).eq('id', id).eq('clinic_id', clinic.id).select('contact_id, starts_at').single();
  if (data?.contact_id && status === 'realizado') {
    await supabase.from('contacts').update({ last_visit_at: data.starts_at }).eq('id', data.contact_id);
    // a cobrança foi criada pelo banco ao marcar "realizado" (consulta com valor)
    if (pay === 'pago') {
      const p = payFields(fd);
      await supabase.from('charges').update({ status: 'pago', paid_at: new Date().toISOString(), payment_method: p.method, installments: p.method === 'credito' ? p.installments : 1, meta: { forma: 'pago na consulta' } }).eq('appointment_id', id).eq('status', 'aberto');
    }
    if (pay === 'balcao') await supabase.from('charges').update({ meta: { forma: 'balcao' } }).eq('appointment_id', id).eq('status', 'aberto');
  }
  // vaga liberada: a lista de espera recebe a oferta pelo WhatsApp (se a clínica ligou o webhook)
  if (status === 'cancelado' && before?.status !== 'cancelado') {
    const r = await notifyWaitlist(supabase, clinic.id, id);
    if (r === 'enviado' && data?.contact_id) await supabase.from('activities').insert({ clinic_id: clinic.id, contact_id: data.contact_id, type: 'sistema', body: 'Consulta cancelada: a vaga foi oferecida à lista de espera pelo WhatsApp.' });
  }
  revalidatePath('/app/agenda');
  revalidatePath('/app/financeiro');
  revalidatePath('/app');
}

export async function markChargePaid(fd: FormData) {
  const { supabase, clinic } = await getContext();
  const p = payFields(fd);
  await supabase.from('charges').update({ status: 'pago', paid_at: new Date().toISOString(), payment_method: p.method, installments: p.method === 'credito' ? p.installments : 1 })
    .eq('id', z.string().uuid().parse(fd.get('id'))).eq('clinic_id', clinic.id).eq('status', 'aberto');
  revalidatePath('/app/agenda');
  revalidatePath('/app/financeiro');
  revalidatePath('/app');
}

/** Lembrete enviado à mão pelo WhatsApp (plano sem automações): fica registrado na consulta. */
export async function markReminderSent(id: string) {
  const { supabase, clinic } = await getContext();
  const ok = z.string().uuid().safeParse(id);
  if (!ok.success) return;
  const { data: a } = await supabase.from('appointments').select('meta, contact_id').eq('id', id).eq('clinic_id', clinic.id).maybeSingle();
  if (!a) return;
  const when = new Date().toISOString();
  await supabase.from('appointments').update({ meta: { ...((a.meta as object) || {}), lembrete_manual_em: when } }).eq('id', id).eq('clinic_id', clinic.id);
  if (a.contact_id) await supabase.from('activities').insert({ clinic_id: clinic.id, contact_id: a.contact_id, type: 'whatsapp', body: 'Lembrete da consulta enviado pelo WhatsApp.' });
  revalidatePath('/app/agenda');
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
