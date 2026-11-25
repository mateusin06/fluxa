'use client';
import { useActionState, useMemo, useState, useTransition } from 'react';
import { FormMsg, Submit } from '@/components/ui';
import { PatientPicker } from '@/components/patient-picker';
import { METHODS, parseMoney } from '@/lib/payments';
import { approveQuote, createQuote, markQuoteSent, saveQuote } from './actions';

interface Proc { id: string; name: string; price: number | null }
export interface QItem { procedure_id: string | null; description: string; region: string; qty: number; unit_price: string }
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const norm = (s: string) => s.trim().toLocaleLowerCase('pt-BR');

export function NewQuote({ pros, preset }: { pros: { id: string; name: string }[]; preset?: { id: string; name: string } | null }) {
  const [s, act] = useActionState(createQuote, null);
  return (
    <form action={act} className="card flex flex-wrap items-end gap-3">
      <PatientPicker required initial={preset} className="w-72" />
      {pros.length > 0 && <div><label className="label" htmlFor="nq-p">Profissional</label><select id="nq-p" name="professional_id" className="field w-56"><option value="">—</option>{pros.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>}
      <Submit>Novo orçamento</Submit><FormMsg state={s} />
    </form>
  );
}

export function QuoteEditor({ q, items: initial, procs, pros, editable, kind }: {
  q: { id: string; professional_id: string | null; discount: number; notes: string | null; valid_until: string | null };
  items: QItem[]; procs: Proc[]; pros: { id: string; name: string }[]; editable: boolean; kind: 'odonto' | 'estetica';
}) {
  const [items, setItems] = useState<QItem[]>(initial.length ? initial : [{ procedure_id: null, description: '', region: '', qty: 1, unit_price: '' }]);
  const [discount, setDiscount] = useState(q.discount ? String(q.discount).replace('.', ',') : '');
  const [notes, setNotes] = useState(q.notes || '');
  const [valid, setValid] = useState(q.valid_until || '');
  const [pro, setPro] = useState(q.professional_id || '');
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const subtotal = useMemo(() => items.reduce((a, i) => a + (Number(i.qty) || 0) * (parseMoney(i.unit_price) || 0), 0), [items]);
  const disc = parseMoney(discount) || 0;
  const total = Math.max(0, subtotal - disc);
  const set = (k: number, patch: Partial<QItem>) => { setItems((l) => l.map((x, j) => (j === k ? { ...x, ...patch } : x))); setMsg(null); };
  function onDesc(k: number, v: string) {
    const p = procs.find((x) => norm(x.name) === norm(v));
    set(k, p ? { description: p.name, procedure_id: p.id, unit_price: items[k].unit_price || (p.price !== null ? String(p.price).replace('.', ',') : '') } : { description: v, procedure_id: null });
  }
  async function save() {
    setBusy(true); setMsg(null);
    try {
      setMsg(await saveQuote({ id: q.id, professional_id: pro, discount, notes, valid_until: valid, items: items.filter((i) => i.description.trim()) }));
    } catch (e) { setMsg({ error: (e as Error).message }); } finally { setBusy(false); }
  }

  return (
    <section className="card space-y-4" aria-labelledby="q-items">
      <h2 id="q-items" className="font-semibold">Itens do plano de tratamento</h2>
      <fieldset disabled={!editable} className="space-y-2">
        <legend className="sr-only">Itens</legend>
        <datalist id="q-procs">{procs.map((p) => <option key={p.id} value={p.name} />)}</datalist>
        <div className="hidden gap-2 text-xs font-semibold text-slate-500 sm:grid sm:grid-cols-[1.6fr_0.8fr_70px_110px_110px_32px]">
          <span>Procedimento</span><span>{kind === 'odonto' ? 'Dente / região' : 'Região'}</span><span>Sessões</span><span>Valor unit. (R$)</span><span className="text-right">Subtotal</span><span />
        </div>
        {items.map((it, k) => (
          <div key={k} className="grid items-center gap-2 border-b border-slate-100 pb-2 sm:grid-cols-[1.6fr_0.8fr_70px_110px_110px_32px]">
            <div><label className="sr-only" htmlFor={`qi-d-${k}`}>Procedimento do item {k + 1}</label><input id={`qi-d-${k}`} list="q-procs" value={it.description} onChange={(e) => onDesc(k, e.target.value)} maxLength={160} placeholder="Escolha ou escreva" className="field" /></div>
            <div><label className="sr-only" htmlFor={`qi-r-${k}`}>Região do item {k + 1}</label><input id={`qi-r-${k}`} value={it.region} onChange={(e) => set(k, { region: e.target.value })} maxLength={60} placeholder={kind === 'odonto' ? 'ex.: 36' : 'ex.: testa'} className="field" /></div>
            <div><label className="sr-only" htmlFor={`qi-q-${k}`}>Sessões do item {k + 1}</label><input id={`qi-q-${k}`} type="number" min={1} max={99} value={it.qty} onChange={(e) => set(k, { qty: Number(e.target.value) })} className="field" /></div>
            <div><label className="sr-only" htmlFor={`qi-v-${k}`}>Valor unitário do item {k + 1}</label><input id={`qi-v-${k}`} inputMode="decimal" value={it.unit_price} onChange={(e) => set(k, { unit_price: e.target.value })} placeholder="0,00" className="field" /></div>
            <p className="text-right text-sm font-medium">{brl((Number(it.qty) || 0) * (parseMoney(it.unit_price) || 0))}</p>
            <button type="button" onClick={() => setItems((l) => l.filter((_, j) => j !== k))} aria-label={`Remover item ${k + 1}`} className="text-slate-400 hover:text-red-700">×</button>
          </div>
        ))}
        <button type="button" onClick={() => setItems((l) => [...l, { procedure_id: null, description: '', region: '', qty: 1, unit_price: '' }])} className="rounded border border-dashed border-slate-300 px-3 py-1 text-sm hover:bg-slate-50">+ item</button>
        <div className="grid gap-3 pt-2 sm:grid-cols-3">
          <div><label className="label" htmlFor="q-disc">Desconto (R$)</label><input id="q-disc" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0,00" className="field" /></div>
          <div><label className="label" htmlFor="q-valid">Válido até</label><input id="q-valid" type="date" value={valid} onChange={(e) => setValid(e.target.value)} className="field" /></div>
          {pros.length > 0 && <div><label className="label" htmlFor="q-pro">Profissional</label><select id="q-pro" value={pro} onChange={(e) => setPro(e.target.value)} className="field"><option value="">—</option>{pros.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>}
          <div className="sm:col-span-3"><label className="label" htmlFor="q-notes">Observações (aparecem no PDF)</label><textarea id="q-notes" rows={2} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} className="field" placeholder="Condições, o que está incluso, cuidados..." /></div>
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 px-4 py-3">
        <p className="text-sm">Subtotal {brl(subtotal)}{disc > 0 && <> · desconto {brl(disc)}</>}</p>
        <p className="text-lg font-bold">Total {brl(total)}</p>
      </div>
      {editable && <div className="flex items-center gap-3"><button type="button" onClick={save} disabled={busy} className="btn btn-pri">{busy ? 'Salvando...' : 'Salvar orçamento'}</button><FormMsg state={msg} /></div>}
    </section>
  );
}

export function SendQuote({ id, href, sent }: { id: string; href: string | null; sent: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={`/app/orcamentos/${id}/pdf`} target="_blank" rel="noreferrer" className="btn btn-sec">Baixar PDF</a>
      {href && <a href={href} target="_blank" rel="noreferrer" onClick={() => !sent && start(() => markQuoteSent(id))} className="btn btn-lima">{pending ? 'Registrando...' : 'Enviar pelo WhatsApp'}</a>}
      {!sent && <button type="button" onClick={() => start(() => markQuoteSent(id))} className="text-sm underline">Marcar como enviado</button>}
    </div>
  );
}

export function ApproveQuote({ id, total }: { id: string; total: number }) {
  const [s, act] = useActionState(approveQuote, null);
  const [method, setMethod] = useState('pix');
  const [n, setN] = useState(1);
  const today = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
  const card = method === 'credito' || method === 'debito';
  const part = n > 0 ? total / n : total;
  return (
    <form action={act} className="card space-y-3">
      <h2 className="font-semibold">Paciente aprovou? Registre o pagamento</h2>
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-3 sm:grid-cols-4">
        <div><label className="label" htmlFor="ap-m">Forma</label><select id="ap-m" name="method" value={method} onChange={(e) => setMethod(e.target.value)} className="field">{METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div><label className="label" htmlFor="ap-n">{card ? 'Parcelas na maquininha' : 'Parcelas'}</label><select id="ap-n" name="installments" value={method === 'debito' ? 1 : n} onChange={(e) => setN(Number(e.target.value))} disabled={method === 'debito'} className="field">{Array.from({ length: 24 }, (_, i) => i + 1).map((x) => <option key={x} value={x}>{x === 1 ? 'à vista' : `${x}x`}</option>)}</select>{method === 'debito' && <input type="hidden" name="installments" value="1" />}</div>
        {!card && <div><label className="label" htmlFor="ap-d">{n > 1 ? '1ª parcela vence em' : 'Vencimento'}</label><input id="ap-d" name="first_due" type="date" defaultValue={today} className="field" /></div>}
        {card && <input type="hidden" name="first_due" value={today} />}
        {!card && <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" name="first_paid" /> {n > 1 ? '1ª parcela já paga (entrada)' : 'Já pago'}</label>}
      </div>
      <p className="text-sm text-slate-600">{card
        ? `Entra no Financeiro como recebido hoje: ${brl(total)}${method === 'credito' && n > 1 ? ` em ${n}x no cartão` : ''}.`
        : n > 1 ? `Gera ${n} cobranças mensais de cerca de ${brl(part)} no Financeiro (com lembrete automático, se a automação de cobrança estiver ligada).` : `Gera uma cobrança de ${brl(total)} no Financeiro.`}
        {' '}A oportunidade no funil vai para ganho.</p>
      <div className="flex items-center gap-3"><Submit>Aprovar orçamento</Submit><FormMsg state={s} /></div>
    </form>
  );
}
