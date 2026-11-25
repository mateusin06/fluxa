'use client';
import { useActionState, useState } from 'react';
import { FormMsg, Submit } from '@/components/ui';
import { PatientPicker } from '@/components/patient-picker';
import { createAppointment } from './actions';

interface Opt { id: string; name: string }
export interface ProcOpt extends Opt { duration_min: number; price: number | null }

const norm = (s: string) => s.trim().toLocaleLowerCase('pt-BR');

export interface PlanItem { id: string; description: string; procName: string | null; duration: number; done: number; qty: number }

export function NewAppointment({ pros, procs, preset, presetStart, presetPro, defaultMin, plan }: {
  pros: Opt[]; procs: ProcOpt[]; preset?: Opt | null; presetStart?: string; presetPro?: string; defaultMin: number; plan?: PlanItem | null;
}) {
  const [s, act] = useActionState(createAppointment, null);
  const [proc, setProc] = useState(plan ? plan.procName || plan.description : '');
  const [dur, setDur] = useState(plan ? plan.duration : defaultMin);
  const [livre, setLivre] = useState(false);
  const known = procs.find((p) => norm(p.name) === norm(proc));
  const custom = !plan && !!proc.trim() && !known;

  function onProc(v: string) {
    setProc(v);
    const p = procs.find((x) => norm(x.name) === norm(v));
    if (p) setDur(p.duration_min); // preenche sozinho; a pessoa ainda pode mudar
  }

  return (
    <form action={act} className="card grid gap-3 sm:grid-cols-3">
      <h2 className="font-semibold sm:col-span-3">{plan ? 'Agendar sessão do plano de tratamento' : 'Nova consulta'}</h2>
      {plan && (
        <p className="rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-900 sm:col-span-3">
          {plan.description}: sessão {Math.min(plan.done + 1, plan.qty)} de {plan.qty}. Já cobrada no orçamento, então não gera cobrança de novo ao marcar realizado.
          <input type="hidden" name="quote_item_id" value={plan.id} />
        </p>
      )}
      <PatientPicker initial={preset} disabled={livre || !!plan} required={!livre} />
      <div><label className="label" htmlFor="ap-p">Profissional</label><select id="ap-p" name="professional_id" defaultValue={presetPro || ''} className="field"><option value="">{pros.length ? 'Automático: o primeiro livre' : '—'}</option>{pros.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      <div>
        <label className="label" htmlFor="ap-pr">Procedimento</label>
        <input id="ap-pr" name="procedure" list="ap-pr-list" value={proc} onChange={(e) => onProc(e.target.value)} maxLength={120} placeholder="Escolha ou escreva" autoComplete="off" readOnly={!!plan} className="field" />
        <datalist id="ap-pr-list">{procs.map((p) => <option key={p.id} value={p.name}>{p.duration_min} min{p.price !== null ? ` · R$ ${p.price.toFixed(2).replace('.', ',')}` : ''}</option>)}</datalist>
        {custom && <p className="mt-1 text-xs text-amber-700">Procedimento fora da lista de Configurações.</p>}
      </div>
      <div><label className="label" htmlFor="ap-s">Data e hora</label><input id="ap-s" name="starts_at" type="datetime-local" required defaultValue={presetStart} className="field" /></div>
      <div>
        <label className="label" htmlFor="ap-d">Duração (min)</label>
        <input id="ap-d" name="duration" type="number" min={5} max={600} step={5} value={dur} onChange={(e) => setDur(Number(e.target.value))} className="field" />
        {known && dur !== known.duration_min && <p className="mt-1 text-xs text-slate-500">Padrão do procedimento: {known.duration_min} min. <button type="button" className="underline" onClick={() => setDur(known.duration_min)}>Voltar ao padrão</button></p>}
      </div>
      {custom
        ? <div><label className="label" htmlFor="ap-price">Preço deste procedimento (R$)</label><input id="ap-price" name="price" inputMode="decimal" placeholder="0,00" className="field" /></div>
        : <div><label className="label" htmlFor="ap-n">Observação</label><input id="ap-n" name="notes" className="field" /></div>}
      {custom && <div className="sm:col-span-3"><label className="label" htmlFor="ap-n2">Observação</label><input id="ap-n2" name="notes" className="field" /></div>}
      <div className="space-y-1 text-sm sm:col-span-3">
        <label className="flex items-center gap-2"><input type="checkbox" name="encaixe" /> Encaixe: agendar mesmo se o horário estiver ocupado</label>
        {!plan && <label className="flex items-center gap-2"><input type="checkbox" name="livre" checked={livre} onChange={(e) => setLivre(e.target.checked)} /> Horário livre extra (sem paciente, fora do horário de atendimento): as automações oferecem a quem pedir pelo WhatsApp</label>}
      </div>
      <div className="flex items-center gap-3 sm:col-span-3"><Submit>{livre ? 'Criar horário livre' : 'Agendar'}</Submit><FormMsg state={s} /></div>
    </form>
  );
}
