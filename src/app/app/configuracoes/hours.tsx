'use client';
import { useMemo, useState } from 'react';
import { FormMsg } from '@/components/ui';
import { normalizeHours, WEEKDAYS, type Hour } from '@/lib/slots';
import { saveHours } from './actions';

interface Iv { start: string; end: string }
interface Proc { id: string; name: string; duration_min: number }
const ORDER = [1, 2, 3, 4, 5, 6, 0]; // segunda primeiro
const hhmm = (t: string) => String(t).slice(0, 5);

export function HoursForm({ hours, procs, cfg, disabled }: {
  hours: Hour[]; procs: Proc[]; disabled: boolean;
  cfg: { slot_procedure_id: string | null; slot_minutes: number; slot_capacity: number; slot_days_ahead: number };
}) {
  const [days, setDays] = useState<Record<number, Iv[]>>(() => {
    const d: Record<number, Iv[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    hours.forEach((h) => d[h.weekday].push({ start: hhmm(h.start_time), end: hhmm(h.end_time) }));
    return d;
  });
  const [procId, setProcId] = useState(cfg.slot_procedure_id || '');
  const [minutes, setMinutes] = useState(cfg.slot_minutes);
  const [cap, setCap] = useState(cfg.slot_capacity);
  const [ahead, setAhead] = useState(cfg.slot_days_ahead);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const flat = useMemo(() => ORDER.flatMap((wd) => days[wd].map((iv) => ({ weekday: wd, ...iv }))), [days]);
  const check = normalizeHours(flat);
  const proc = procs.find((p) => p.id === procId);

  const set = (wd: number, list: Iv[]) => { setDays((d) => ({ ...d, [wd]: list })); setMsg(null); };
  const add = (wd: number) => {
    const list = days[wd];
    const last = list[list.length - 1];
    set(wd, [...list, last ? { start: last.end, end: last.end < '18:00' ? '18:00' : '20:00' } : { start: '08:00', end: '12:00' }]);
  };
  const copyWeekdays = () => setDays((d) => ({ ...d, 2: [...d[1]], 3: [...d[1]], 4: [...d[1]], 5: [...d[1]] }));
  const fillDefault = () => setDays({ 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] , ...Object.fromEntries([1, 2, 3, 4, 5].map((w) => [w, [{ start: '08:00', end: '12:00' }, { start: '13:00', end: '18:00' }]])) });

  async function save() {
    if (!check.ok) { setMsg({ error: check.error }); return; }
    setBusy(true); setMsg(null);
    try {
      setMsg(await saveHours({ hours: flat, slot_procedure_id: procId || null, slot_minutes: Number(minutes), slot_capacity: Number(cap), slot_days_ahead: Number(ahead) }));
    } catch (e) { setMsg({ error: (e as Error).message }); } finally { setBusy(false); }
  }

  return (
    <section id="horarios" className="card space-y-4" aria-labelledby="h-title">
      <div>
        <h2 id="h-title" className="font-semibold">Horário de atendimento</h2>
        <p className="text-sm text-slate-600">Coloque os intervalos em que a clínica atende. Para o almoço, use dois intervalos no mesmo dia (ex.: 08:00–12:00 e 13:30–18:00). O que não estiver ocupado vira horário livre na Agenda e é oferecido a quem pedir para agendar pelo WhatsApp.</p>
      </div>
      <fieldset disabled={disabled} className="space-y-2">
        <legend className="sr-only">Intervalos por dia da semana</legend>
        {ORDER.map((wd) => (
          <div key={wd} className="grid items-start gap-2 border-b border-slate-100 pb-2 sm:grid-cols-[110px_1fr]">
            <p className="pt-2 text-sm font-medium">{WEEKDAYS[wd]}</p>
            <div className="flex flex-wrap items-center gap-2">
              {days[wd].map((iv, i) => (
                <div key={i} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1">
                  <label className="sr-only" htmlFor={`h-${wd}-${i}-s`}>{WEEKDAYS[wd]}, início do intervalo {i + 1}</label>
                  <input id={`h-${wd}-${i}-s`} type="time" step={300} value={iv.start} onChange={(e) => set(wd, days[wd].map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} className="field w-28 py-1" />
                  <span aria-hidden="true">–</span>
                  <label className="sr-only" htmlFor={`h-${wd}-${i}-e`}>{WEEKDAYS[wd]}, fim do intervalo {i + 1}</label>
                  <input id={`h-${wd}-${i}-e`} type="time" step={300} value={iv.end} onChange={(e) => set(wd, days[wd].map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} className="field w-28 py-1" />
                  <button type="button" onClick={() => set(wd, days[wd].filter((_, j) => j !== i))} className="px-1 text-slate-500 hover:text-red-700" aria-label={`Remover intervalo ${iv.start}–${iv.end} de ${WEEKDAYS[wd]}`}>×</button>
                </div>
              ))}
              {!days[wd].length && <span className="text-sm text-slate-400">Fechado</span>}
              <button type="button" onClick={() => add(wd)} className="rounded border border-dashed border-slate-300 px-2 py-1 text-sm hover:bg-slate-50">+ intervalo</button>
            </div>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={copyWeekdays} className="btn btn-sec">Copiar segunda para terça a sexta</button>
          {!flat.length && <button type="button" onClick={fillDefault} className="btn btn-sec">Preencher seg–sex 08–12 e 13–18</button>}
        </div>
      </fieldset>

      <fieldset disabled={disabled} className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-1 text-sm font-semibold">Como os horários são oferecidos no WhatsApp</legend>
        <div>
          <label className="label" htmlFor="h-proc">Procedimento agendado pelo WhatsApp</label>
          <select id="h-proc" value={procId} onChange={(e) => setProcId(e.target.value)} className="field">
            <option value="">Nenhum: usar duração fixa</option>
            {procs.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.duration_min} min)</option>)}
          </select>
          <p className="mt-1 text-xs text-slate-500">Normalmente a avaliação. A duração dele define o tamanho de cada horário oferecido.</p>
        </div>
        {!proc && (
          <div><label className="label" htmlFor="h-min">Duração fixa de cada horário (min)</label><input id="h-min" type="number" min={5} max={600} step={5} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="field" /></div>
        )}
        <div>
          <label className="label" htmlFor="h-cap">Atendimentos ao mesmo tempo</label>
          <input id="h-cap" type="number" min={1} max={20} value={cap} onChange={(e) => setCap(Number(e.target.value))} className="field" />
          <p className="mt-1 text-xs text-slate-500">Quantas consultas cabem no mesmo horário (cadeiras, salas ou profissionais atendendo juntos).</p>
        </div>
        <div><label className="label" htmlFor="h-ahead">Oferecer horários até quantos dias à frente</label><input id="h-ahead" type="number" min={1} max={90} value={ahead} onChange={(e) => setAhead(Number(e.target.value))} className="field" /></div>
      </fieldset>

      {!check.ok && <p role="alert" className="text-sm text-red-700">{check.error}</p>}
      {!disabled && (
        <div className="flex items-center gap-3">
          <button type="button" onClick={save} disabled={busy || !check.ok} className="btn btn-pri">{busy ? 'Salvando...' : 'Salvar horário'}</button>
          <FormMsg state={msg} />
        </div>
      )}
    </section>
  );
}
