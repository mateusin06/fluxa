/**
 * Horários livres a partir do horário de atendimento da clínica.
 * Tudo em horário de Brasília (UTC-3, sem horário de verão desde 2019).
 *
 * Regra: um horário está livre quando cabe inteiro dentro de um intervalo de atendimento
 * e, durante todo ele, há menos consultas ao mesmo tempo do que a capacidade da clínica.
 * Depois de uma consulta, o próximo horário livre começa no fim dela (não espera o "redondo").
 */

export interface Hour { weekday: number; start_time: string; end_time: string }
export interface Busy { start: number; end: number }

const MIN = 60000;
const DAY = 86400000;
const TZ = 3 * 3600000; // Brasília = UTC-3

export const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

/** "08:00" ou "08:00:00" -> minutos desde a meia-noite. */
export function toMin(t: string) {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}
export const fromMin = (n: number) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;

/** Meia-noite (Brasília) do dia de `ms`, em ms UTC. */
export function localMidnight(ms: number) {
  const l = ms - TZ;
  return l - (((l % DAY) + DAY) % DAY) + TZ;
}
/** Dia da semana (Brasília) de `ms`. */
export const localWeekday = (ms: number) => new Date(ms - TZ).getUTCDay();

/** Intervalos de atendimento concretos (ms) entre `from` e `to`. */
export function openWindows(hours: Hour[], from: number, to: number): Busy[] {
  const out: Busy[] = [];
  for (let d = localMidnight(from); d < to; d += DAY) {
    const wd = localWeekday(d + 12 * 3600000);
    for (const h of hours) {
      if (Number(h.weekday) !== wd) continue;
      const s = d + toMin(h.start_time) * MIN, e = d + toMin(h.end_time) * MIN;
      if (e > s && e > from && s < to) out.push({ start: s, end: e });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

const overlapping = (busy: Busy[], s: number, e: number) => busy.filter((b) => b.start < e && b.end > s);

/** Maior número de consultas ao mesmo tempo dentro de [start, end). */
export function peak(busy: Busy[], start: number, end: number) {
  const ev: [number, number][] = [];
  for (const b of busy) if (b.start < end && b.end > start) ev.push([Math.max(b.start, start), 1], [Math.min(b.end, end), -1]);
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let n = 0, max = 0;
  for (const [, d] of ev) { n += d; if (n > max) max = n; }
  return max;
}

/**
 * Inícios de horários livres.
 * @param durMin   duração necessária (o procedimento oferecido)
 * @param stepMin  distância entre um horário oferecido e o próximo
 * @param capacity atendimentos ao mesmo tempo
 */
export function freeSlots(opts: { hours: Hour[]; busy: Busy[]; from: number; to: number; durMin: number; stepMin?: number; capacity?: number; limit?: number }): number[] {
  const dur = Math.max(5, opts.durMin) * MIN, step = Math.max(5, opts.stepMin || opts.durMin) * MIN, cap = Math.max(1, opts.capacity || 1);
  const out: number[] = [];
  for (const w of openWindows(opts.hours, opts.from, opts.to)) {
    let t = w.start;
    if (t < opts.from) t = w.start + Math.ceil((opts.from - w.start) / step) * step;
    while (t + dur <= w.end && t < opts.to) {
      const ov = overlapping(opts.busy, t, t + dur);
      if (peak(ov, t, t + dur) < cap) {
        out.push(t);
        if (opts.limit && out.length >= opts.limit) return out;
        t += step;
      } else {
        // pula para o primeiro momento em que alguma das consultas acaba
        const next = Math.min(...ov.map((b) => b.end));
        t = next > t ? next : t + MIN;
      }
    }
  }
  return out;
}

/** Trechos livres de cada intervalo (para mostrar na agenda): onde há menos consultas que a capacidade. */
export function freeGaps(opts: { hours: Hour[]; busy: Busy[]; from: number; to: number; capacity?: number; minMin?: number }): Busy[] {
  const cap = Math.max(1, opts.capacity || 1), minLen = (opts.minMin ?? 5) * MIN;
  const out: Busy[] = [];
  for (const w of openWindows(opts.hours, opts.from, opts.to)) {
    const s0 = Math.max(w.start, opts.from), e0 = Math.min(w.end, opts.to);
    if (e0 <= s0) continue;
    const ov = overlapping(opts.busy, s0, e0);
    const cuts = [...new Set([s0, e0, ...ov.flatMap((b) => [b.start, b.end]).filter((x) => x > s0 && x < e0)])].sort((a, b) => a - b);
    for (let i = 0; i < cuts.length - 1; i++) {
      const a = cuts[i], b = cuts[i + 1];
      if (overlapping(ov, a, b).length >= cap) continue;
      const last = out[out.length - 1];
      if (last && last.end === a) last.end = b; else out.push({ start: a, end: b });
    }
  }
  return out.filter((g) => g.end - g.start >= minLen);
}

/** A consulta cabe inteira em algum intervalo de atendimento? */
export function insideHours(hours: Hour[], start: number, end: number) {
  return openWindows(hours, start - DAY, end + DAY).some((w) => w.start <= start && w.end >= end);
}

/** Valida e organiza os intervalos digitados: sem sobreposição no mesmo dia, ordenados. */
export function normalizeHours(rows: { weekday: number; start: string; end: string }[]): { ok: true; rows: Hour[] } | { ok: false; error: string } {
  const list = rows.map((r) => ({ weekday: Number(r.weekday), s: toMin(r.start), e: toMin(r.end) }));
  for (const r of list) {
    if (!(r.weekday >= 0 && r.weekday <= 6)) return { ok: false, error: 'Dia da semana inválido.' };
    if (isNaN(r.s) || isNaN(r.e) || r.s < 0 || r.e > 24 * 60) return { ok: false, error: `${WEEKDAYS[r.weekday]}: horário inválido.` };
    if (r.e <= r.s) return { ok: false, error: `${WEEKDAYS[r.weekday]}: o fim (${fromMin(r.e)}) precisa ser depois do início (${fromMin(r.s)}).` };
  }
  list.sort((a, b) => a.weekday - b.weekday || a.s - b.s);
  for (let i = 1; i < list.length; i++) {
    const a = list[i - 1], b = list[i];
    if (a.weekday === b.weekday && b.s < a.e) return { ok: false, error: `${WEEKDAYS[a.weekday]}: os intervalos ${fromMin(a.s)}–${fromMin(a.e)} e ${fromMin(b.s)}–${fromMin(b.e)} se sobrepõem.` };
  }
  return { ok: true, rows: list.map((r) => ({ weekday: r.weekday, start_time: fromMin(r.s), end_time: fromMin(r.e) })) };
}

/** Identificador e linha estáveis de um horário livre gerado (não existe na tabela até alguém marcar). */
const BASE = Date.UTC(2026, 0, 1);
export const VIRTUAL_ROW0 = 900000000;
export const slotRow = (ms: number) => VIRTUAL_ROW0 + Math.round((ms - BASE) / MIN);
export const rowToSlot = (row: number) => (row >= VIRTUAL_ROW0 ? BASE + (row - VIRTUAL_ROW0) * MIN : null);
export const slotId = (ms: number) => 'livre-' + new Date(ms - TZ).toISOString().slice(0, 16).replace(/\D/g, '');
