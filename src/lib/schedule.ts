import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { freeSlots, insideHours, peak, type Busy, type Hour } from '@/lib/slots';

/** Status que NÃO ocupam a agenda. */
export const FREE_STATUS = ['cancelado', 'livre'] as const;

export interface Schedule {
  hours: Hour[];
  capacity: number;
  daysAhead: number;
  /** Duração do horário oferecido no WhatsApp (procedimento escolhido em Configurações, ou o padrão em minutos). */
  slotMin: number;
  slotProc: { id: string; name: string; duration_min: number; price: number | null } | null;
}

export async function loadSchedule(db: SupabaseClient, cid: string): Promise<Schedule> {
  const [{ data: c }, { data: h }] = await Promise.all([
    db.from('clinics').select('slot_minutes, slot_capacity, slot_days_ahead, slot_procedure_id, slot_proc:procedures!clinics_slot_procedure_id_fkey(id, name, duration_min, price)').eq('id', cid).single(),
    db.from('business_hours').select('weekday, start_time, end_time').eq('clinic_id', cid).order('weekday').order('start_time'),
  ]);
  const p = (c?.slot_proc as unknown as Schedule['slotProc']) || null;
  return {
    hours: (h || []) as Hour[],
    capacity: c?.slot_capacity || 1,
    daysAhead: c?.slot_days_ahead || 21,
    slotMin: p?.duration_min || c?.slot_minutes || 30,
    slotProc: p ? { ...p, price: p.price === null ? null : Number(p.price) } : null,
  };
}

/** Consultas que ocupam a agenda entre `from` e `to`. */
export async function loadBusy(db: SupabaseClient, cid: string, from: number, to: number, excludeId?: string) {
  let q = db.from('appointments').select('id, starts_at, ends_at').eq('clinic_id', cid)
    .not('status', 'in', `(${FREE_STATUS.join(',')})`)
    .lt('starts_at', new Date(to).toISOString()).gt('ends_at', new Date(from).toISOString()).limit(5000);
  if (excludeId) q = q.neq('id', excludeId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []).map((a) => ({ id: a.id as string, start: new Date(a.starts_at).getTime(), end: new Date(a.ends_at).getTime() }));
}

/** Diz se [start, end) cabe na agenda: dentro do horário de atendimento e sem passar da capacidade. */
export async function checkFit(db: SupabaseClient, cid: string, s: Schedule, start: number, end: number, excludeId?: string) {
  const busy = await loadBusy(db, cid, start, end, excludeId);
  const full = peak(busy, start, end) >= s.capacity;
  return { inside: s.hours.length ? insideHours(s.hours, start, end) : true, full, busy };
}

/** Próximos horários livres (ms). */
export async function nextFree(db: SupabaseClient, cid: string, s: Schedule, opts: { from?: number; to?: number; durMin?: number; limit?: number } = {}) {
  if (!s.hours.length) return [];
  const from = opts.from ?? Date.now(), to = opts.to ?? from + s.daysAhead * 86400000;
  const busy: Busy[] = await loadBusy(db, cid, from, to);
  return freeSlots({ hours: s.hours, busy, from, to, durMin: opts.durMin || s.slotMin, stepMin: s.slotMin, capacity: s.capacity, limit: opts.limit });
}
