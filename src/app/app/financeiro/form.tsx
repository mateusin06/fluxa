'use client';
import { useActionState, useState } from 'react';
import { FormMsg, Submit } from '@/components/ui';
import { PatientPicker } from '@/components/patient-picker';
import { EXPENSE_CATEGORIES, METHODS } from '@/lib/payments';
import { addCharge, addExpense } from './actions';

export function ChargeForm() {
  const [s, act] = useActionState(addCharge, null);
  return (
    <form action={act} className="card grid gap-3 sm:grid-cols-5">
      <PatientPicker required className="sm:col-span-2" />
      <div><label className="label" htmlFor="ch-v">Valor (R$)</label><input id="ch-v" name="amount" required inputMode="decimal" className="field" /></div>
      <div><label className="label" htmlFor="ch-d">Vencimento</label><input id="ch-d" name="due_date" type="date" required className="field" /></div>
      <div><label className="label" htmlFor="ch-desc">Descrição</label><input id="ch-desc" name="description" className="field" placeholder="Parcela 2/6" /></div>
      <div className="sm:col-span-3"><label className="label" htmlFor="ch-l">Link de pagamento (Pix, boleto)</label><input id="ch-l" name="payment_link" type="url" className="field" /></div>
      <div className="flex items-end gap-3 sm:col-span-2"><Submit>Registrar</Submit><FormMsg state={s} /></div>
    </form>
  );
}

export function ExpenseForm({ pros }: { pros: { id: string; name: string }[] }) {
  const [s, act] = useActionState(addExpense, null);
  const [paid, setPaid] = useState(false);
  const [cat, setCat] = useState('outros');
  const today = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
  return (
    <form action={act} className="card grid gap-3 sm:grid-cols-6">
      <h2 className="font-semibold sm:col-span-6">Nova despesa</h2>
      <div className="sm:col-span-2"><label className="label" htmlFor="ex-d">Descrição</label><input id="ex-d" name="description" required maxLength={200} className="field" placeholder="Aluguel, laboratório, resina..." /></div>
      <div><label className="label" htmlFor="ex-c">Categoria</label><select id="ex-c" name="category" value={cat} onChange={(e) => setCat(e.target.value)} className="field">{EXPENSE_CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
      <div><label className="label" htmlFor="ex-v">Valor (R$)</label><input id="ex-v" name="amount" required inputMode="decimal" className="field" /></div>
      <div><label className="label" htmlFor="ex-due">Vencimento</label><input id="ex-due" name="due_date" type="date" required defaultValue={today} className="field" /></div>
      <div><label className="label" htmlFor="ex-r">Repetir</label><select id="ex-r" name="repeat" className="field"><option value="1">Só este mês</option>{[2, 3, 6, 12].map((n) => <option key={n} value={n}>{n} meses</option>)}</select></div>
      {(cat === 'comissao' || cat === 'salarios') && pros.length > 0 && (
        <div className="sm:col-span-2"><label className="label" htmlFor="ex-p">Profissional</label><select id="ex-p" name="professional_id" className="field"><option value="">—</option>{pros.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      )}
      <div className="flex flex-wrap items-end gap-3 sm:col-span-4">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="paid" checked={paid} onChange={(e) => setPaid(e.target.checked)} /> Já paga</label>
        {paid && <div><label className="sr-only" htmlFor="ex-m">Forma de pagamento</label><select id="ex-m" name="method" className="field">{METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>}
        <Submit>Lançar</Submit><FormMsg state={s} />
      </div>
    </form>
  );
}
