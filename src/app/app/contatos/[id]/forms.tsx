'use client';
import { useActionState, useState } from 'react';
import { FormMsg, Submit } from '@/components/ui';
import { addActivity, createDeal, updateContact, updateDeal } from '../../crm-actions';
import { SOURCES } from '@/lib/sources';
import type { Contact } from '@/lib/types';
import { waLink } from '@/lib/utils';
import { InsuranceFields } from '@/components/insurance-fields';

export function EditContact({ c, readOnly, insurances = [], accepts = false }: { c: Contact; readOnly: boolean; insurances?: string[]; accepts?: boolean }) {
  const [s, act] = useActionState(updateContact, null);
  return (
    <form action={act} className="card space-y-3">
      <h2 className="font-semibold">Dados</h2>
      <input type="hidden" name="id" value={c.id} />
      <fieldset disabled={readOnly} className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="e-name">Nome</label><input id="e-name" name="name" defaultValue={c.name} className="field" /></div>
        <div><label className="label" htmlFor="e-phone">WhatsApp</label><input id="e-phone" name="phone" defaultValue={c.phone || ''} className="field" /></div>
        <div><label className="label" htmlFor="e-email">E-mail</label><input id="e-email" name="email" type="email" defaultValue={c.email || ''} className="field" /></div>
        <div><label className="label" htmlFor="e-doc">CPF (sai no recibo, para reembolso)</label><input id="e-doc" name="document" inputMode="numeric" maxLength={20} defaultValue={c.document || ''} className="field" /></div>
        <div><label className="label" htmlFor="e-birth">Nascimento</label><input id="e-birth" name="birth_date" type="date" defaultValue={c.birth_date || ''} className="field" /></div>
        <InsuranceFields idp="e" list={insurances} accepts={accepts} c={c} />
        <div><label className="label" htmlFor="e-src">Origem</label><select id="e-src" name="source" defaultValue={c.source} className="field">{SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div><label className="label" htmlFor="e-tags">Etiquetas (vírgula)</label><input id="e-tags" name="tags" defaultValue={(c.tags || []).join(', ')} className="field" /></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="e-notes">Observações</label><textarea id="e-notes" name="notes" rows={3} defaultValue={c.notes || ''} className="field" /></div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="consent_whatsapp" defaultChecked={c.consent_whatsapp} /> Aceita receber mensagens no WhatsApp (LGPD)</label>
      </fieldset>
      {!readOnly && <div className="flex items-center gap-3"><Submit>Salvar</Submit><FormMsg state={s} /></div>}
    </form>
  );
}

export function DealRow({ d, stages, contactId, readOnly }: { d: { id: string; title: string; value: number; stage_id: string; lost_reason: string | null }; stages: { id: string; name: string }[]; contactId: string; readOnly: boolean }) {
  const [s, act] = useActionState(updateDeal, null);
  return (
    <form action={act} className="grid items-end gap-2 border-b border-slate-100 py-3 sm:grid-cols-[1fr_120px_180px_auto]">
      <input type="hidden" name="id" value={d.id} /><input type="hidden" name="contact_id" value={contactId} />
      <div><label className="label" htmlFor={`t-${d.id}`}>Oportunidade</label><input id={`t-${d.id}`} name="title" defaultValue={d.title} disabled={readOnly} className="field" /></div>
      <div><label className="label" htmlFor={`v-${d.id}`}>Valor</label><input id={`v-${d.id}`} name="value" defaultValue={String(d.value)} disabled={readOnly} className="field" /></div>
      <div><label className="label" htmlFor={`s-${d.id}`}>Etapa</label><select id={`s-${d.id}`} name="stage_id" defaultValue={d.stage_id} disabled={readOnly} className="field">{stages.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
      {!readOnly && <Submit variant="sec">Salvar</Submit>}
      <input type="hidden" name="lost_reason" value={d.lost_reason || ''} />
      <div className="sm:col-span-4"><FormMsg state={s} /></div>
    </form>
  );
}

export function NewDeal({ contactId, procedures }: { contactId: string; procedures: { id: string; name: string }[] }) {
  const [s, act] = useActionState(createDeal, null);
  return (
    <form action={act} className="mt-3 grid items-end gap-2 sm:grid-cols-[1fr_120px_1fr_auto]">
      <input type="hidden" name="contact_id" value={contactId} />
      <div><label className="label" htmlFor="nd-t">Nova oportunidade</label><input id="nd-t" name="title" placeholder="Ex.: Implante" className="field" /></div>
      <div><label className="label" htmlFor="nd-v">Valor</label><input id="nd-v" name="value" inputMode="decimal" className="field" /></div>
      <div><label className="label" htmlFor="nd-p">Procedimento</label><select id="nd-p" name="procedure_id" className="field"><option value="">—</option>{procedures.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      <Submit variant="sec">Adicionar</Submit>
      <div className="sm:col-span-4"><FormMsg state={s} /></div>
    </form>
  );
}

export function NewActivity({ contactId }: { contactId: string }) {
  const [s, act] = useActionState(addActivity, null);
  const [type, setType] = useState('nota');
  return (
    <form action={act} className="space-y-2">
      <input type="hidden" name="contact_id" value={contactId} />
      <div className="flex flex-wrap gap-2">
        <label htmlFor="a-type" className="sr-only">Tipo</label>
        <select id="a-type" name="type" value={type} onChange={(e) => setType(e.target.value)} className="field max-w-44">
          <option value="nota">Nota</option><option value="ligacao">Ligação</option><option value="whatsapp">WhatsApp</option><option value="email">E-mail</option><option value="tarefa">Tarefa</option>
        </select>
        {type === 'tarefa' && <><label htmlFor="a-due" className="sr-only">Prazo</label><input id="a-due" name="due_at" type="datetime-local" className="field max-w-56" /></>}
      </div>
      <label htmlFor="a-body" className="sr-only">Texto</label>
      <textarea id="a-body" name="body" rows={2} required className="field" placeholder={type === 'tarefa' ? 'O que precisa ser feito?' : 'O que aconteceu?'} />
      <div className="flex items-center gap-3"><Submit variant="sec">Registrar</Submit><FormMsg state={s} /></div>
    </form>
  );
}

export function AiFollowup({ contactId, phone }: { contactId: string; phone: string | null }) {
  const [busy, setBusy] = useState(false);
  const [goal, setGoal] = useState('retomar contato');
  const [out, setOut] = useState<{ mensagens: { abordagem: string; texto: string }[] } | null>(null);
  const [err, setErr] = useState('');
  async function run() {
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/ai/followup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contactId, goal }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Falhou');
      setOut(j);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="card">
      <h2 className="font-semibold">Sugerir mensagem com IA</h2>
      <p className="mb-3 text-sm text-slate-600">A IA lê o histórico e sugere 2 mensagens no estilo de negociação do Chris Voss.</p>
      <div className="flex flex-wrap gap-2">
        <label htmlFor="goal" className="sr-only">Objetivo</label>
        <select id="goal" value={goal} onChange={(e) => setGoal(e.target.value)} className="field max-w-64">
          <option value="retomar contato">Retomar contato</option><option value="agendar avaliação">Agendar avaliação</option>
          <option value="fechar orçamento">Fechar orçamento</option><option value="confirmar presença">Confirmar presença</option>
          <option value="pedir indicação">Pedir indicação</option>
        </select>
        <button type="button" onClick={run} disabled={busy} className="btn btn-lima">{busy ? 'Gerando...' : 'Gerar'}</button>
      </div>
      {err && <p role="alert" className="mt-2 text-sm text-red-700">{err}</p>}
      {out?.mensagens?.map((m, i) => (
        <div key={i} className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
          <p className="mb-1 text-xs font-semibold uppercase text-slate-500">{m.abordagem}</p>
          <p className="whitespace-pre-line">{m.texto}</p>
          <div className="mt-2 flex gap-2">
            <button type="button" className="btn btn-sec min-h-8 px-3 py-1" onClick={() => navigator.clipboard.writeText(m.texto)}>Copiar</button>
            {phone && <a className="btn btn-sec min-h-8 px-3 py-1" target="_blank" rel="noreferrer" href={waLink(phone, m.texto)}>Abrir no WhatsApp</a>}
          </div>
        </div>
      ))}
    </div>
  );
}
