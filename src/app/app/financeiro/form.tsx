'use client';
import { useActionState } from 'react';
import { FormMsg, Submit } from '@/components/ui';
import { addCharge } from './actions';

export function ChargeForm({ contacts }: { contacts: { id: string; name: string }[] }) {
  const [s, act] = useActionState(addCharge, null);
  return (
    <form action={act} className="card grid gap-3 sm:grid-cols-5">
      <div className="sm:col-span-2"><label className="label" htmlFor="ch-c">Paciente</label><select id="ch-c" name="contact_id" required className="field"><option value="">Escolha</option>{contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      <div><label className="label" htmlFor="ch-v">Valor (R$)</label><input id="ch-v" name="amount" required inputMode="decimal" className="field" /></div>
      <div><label className="label" htmlFor="ch-d">Vencimento</label><input id="ch-d" name="due_date" type="date" required className="field" /></div>
      <div><label className="label" htmlFor="ch-desc">Descrição</label><input id="ch-desc" name="description" className="field" placeholder="Parcela 2/6" /></div>
      <div className="sm:col-span-3"><label className="label" htmlFor="ch-l">Link de pagamento (Pix, boleto)</label><input id="ch-l" name="payment_link" type="url" className="field" /></div>
      <div className="flex items-end gap-3 sm:col-span-2"><Submit>Registrar</Submit><FormMsg state={s} /></div>
    </form>
  );
}
