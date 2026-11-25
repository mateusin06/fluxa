import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { freeGapsPros, freeSlotsPros, insideHours, peak, pickPro, type BusyPro, type Hour, type ProSched } from '@/lib/slots';

/** Status que NÃO ocupam a agenda. */
export const FREE_STATUS = ['cancelado', 'livre'] as const;

export interface Schedule {
  /** Horário da clínica (vale para quem não tem horário próprio). */
  hours: Hour[];
  /** Profissionais que atendem na agenda (vazio = a agenda é só da clínica). */
  pros: ProSched[];
  /** Algum horário cadastrado (da clínica ou de algum profissional). */
  hasHours: boolean;
  capacity: number;
  daysAhead: number;
  /** Duração do horário oferecido no WhatsApp (procedimento escolhido em Configurações, ou o padrão em minutos). */
  slotMin: number;
  slotProc: { id: string; name: string; duration_min: number; price: number | null } | null;
}

export async function loadSchedule(db: SupabaseClient, cid: string): Promise<Schedule> {
  const [{ data: c }, { data: h }, { data: pr }, { data: pp }] = await Promise.all([
    db.from('clinics').select('slot_minutes, slot_capacity, slot_days_ahead, slot_procedure_id, slot_proc:procedures!clinics_slot_procedure_id_fkey(id, name, duration_min, price)').eq('id', cid).single(),
    db.from('business_hours').select('weekday, start_time, end_time, professional_id').eq('clinic_id', cid).order('weekday').order('start_time'),
    db.from('professionals').select('id, name').eq('clinic_id', cid).eq('active', true).eq('attends', true).order('name'),
    db.from('professional_procedures').select('professional_id, procedure_id').eq('clinic_id', cid),
  ]);
  const rows = (h || []) as (Hour & { professional_id: string | null })[];
  const clinicHours = rows.filter((r) => !r.professional_id);
  const pros: ProSched[] = (pr || []).map((p) => {
    const own = rows.filter((r) => r.professional_id === p.id);
    const procs = (pp || []).filter((x) => x.professional_id === p.id).map((x) => x.procedure_id as string);
    return { id: p.id, name: p.name, hours: own.length ? own : clinicHours, procs: procs.length ? procs : null };
  });
  const p = (c?.slot_proc as unknown as Schedule['slotProc']) || null;
  return {
    hours: clinicHours,
    pros,
    hasHours: clinicHours.length > 0 || pros.some((x) => x.hours.length > 0),
    capacity: c?.slot_capacity || 1,
    daysAhead: c?.slot_days_ahead || 21,
    slotMin: p?.duration_min || c?.slot_minutes || 30,
    slotProc: p ? { ...p, price: p.price === null ? null : Number(p.price) } : null,
  };
}

/** Consultas que ocupam a agenda entre `from` e `to`. */
export async function loadBusy(db: SupabaseClient, cid: string, from: number, to: number, excludeId?: string): Promise<(BusyPro & { id: string })[]> {
  let q = db.from('appointments').select('id, starts_at, ends_at, professional_id').eq('clinic_id', cid)
    .not('status', 'in', `(${FREE_STATUS.join(',')})`)
    .lt('starts_at', new Date(to).toISOString()).gt('ends_at', new Date(from).toISOString()).limit(5000);
  if (excludeId) q = q.neq('id', excludeId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []).map((a) => ({ id: a.id as string, start: new Date(a.starts_at).getTime(), end: new Date(a.ends_at).getTime(), pro: (a.professional_id as string | null) || null }));
}

/**
 * Diz se [start, end) cabe na agenda:
 *  inside  = dentro do horário (do profissional, quando informado; senão da clínica)
 *  full    = a clínica já está na capacidade máxima nesse momento
 *  proBusy = o profissional informado já tem consulta nesse horário
 */
export async function checkFit(db: SupabaseClient, cid: string, s: Schedule, start: number, end: number, o: { excludeId?: string; proId?: string | null } = {}) {
  const busy = await loadBusy(db, cid, start, end, o.excludeId);
  const full = peak(busy, start, end) >= s.capacity;
  const pro = o.proId ? s.pros.find((p) => p.id === o.proId) : null;
  const hours = pro ? pro.hours : s.hours;
  const inside = hours.length ? insideHours(hours, start, end) : !s.hasHours;
  const proBusy = !!o.proId && busy.some((b) => b.pro === o.proId);
  return { inside, full, proBusy, busy };
}

/** Profissional livre para [start, end) que faz o procedimento (quando a clínica tem profissionais que atendem). */
export async function freePro(db: SupabaseClient, cid: string, s: Schedule, start: number, end: number, procId?: string | null, excludeId?: string) {
  if (!s.pros.length) return null;
  const busy = await loadBusy(db, cid, start, end, excludeId);
  return pickPro(s.pros, busy, start, end, procId);
}

/** Próximos horários livres (ms), com o profissional que atenderia. */
export async function nextFreePro(db: SupabaseClient, cid: string, s: Schedule, opts: { from?: number; to?: number; durMin?: number; limit?: number; procId?: string | null; proId?: string | null } = {}) {
  if (!s.hasHours) return [];
  const from = opts.from ?? Date.now(), to = opts.to ?? from + s.daysAhead * 86400000;
  const busy = await loadBusy(db, cid, from, to);
  return freeSlotsPros({ pros: s.pros, clinicHours: s.hours, busy, from, to, durMin: opts.durMin || s.slotMin, stepMin: s.slotMin, capacity: s.capacity, procId: opts.procId, proId: opts.proId, limit: opts.limit });
}

/** Próximos horários livres (ms). */
export async function nextFree(db: SupabaseClient, cid: string, s: Schedule, opts: { from?: number; to?: number; durMin?: number; limit?: number; procId?: string | null; proId?: string | null } = {}) {
  return (await nextFreePro(db, cid, s, opts)).map((x) => x.t);
}

/** Trechos livres para a tela da agenda. */
export function gapsFor(s: Schedule, busy: BusyPro[], from: number, to: number, proId?: string | null) {
  if (!s.hasHours) return [];
  return freeGapsPros({ pros: s.pros, clinicHours: s.hours, busy, from, to, capacity: s.capacity, proId, minMin: s.slotMin });
}
