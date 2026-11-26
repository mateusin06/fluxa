'use client';
import { useActionState } from 'react';
import { FormMsg, Submit } from '@/components/ui';
import { createContact } from '../crm-actions';
import { SOURCES } from '@/lib/sources';
import { InsuranceFields } from '@/components/insurance-fields';

export function NewContact({ procedures, insurances = [], accepts = false }: { procedures: { id: string; name: string }[]; insurances?: string[]; accepts?: boolean }) {
  const [s, act] = useActionState(createContact, null);
  return (
    <form action={act} className="card grid gap-3 sm:grid-cols-2">
      <h2 className="font-semibold sm:col-span-2">Novo lead ou paciente</h2>
      <div><label className="label" htmlFor="n-name">Nome</label><input id="n-name" name="name" required className="field" /></div>
      <div><label className="label" htmlFor="n-phone">WhatsApp</label><input id="n-phone" name="phone" inputMode="tel" className="field" placeholder="(19) 99999-0000" /></div>
      <div><label className="label" htmlFor="n-email">E-mail</label><input id="n-email" name="email" type="email" className="field" /></div>
      <div><label className="label" htmlFor="n-source">Origem</label><select id="n-source" name="source" className="field">{SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      <div><label className="label" htmlFor="n-birth">Nascimento</label><input id="n-birth" name="birth_date" type="date" className="field" /></div>
      <InsuranceFields idp="n" list={insurances} accepts={accepts} />
      <div><label className="label" htmlFor="n-proc">Interesse</label><select id="n-proc" name="procedure_id" className="field"><option value="">Avaliação</option>{procedures.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      <div><label className="label" htmlFor="n-value">Valor estimado (R$)</label><input id="n-value" name="value" inputMode="decimal" className="field" placeholder="0" /></div>
      <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" name="criar_oportunidade" defaultChecked /> Criar oportunidade no funil</label>
      <div className="sm:col-span-2"><label className="label" htmlFor="n-notes">Observações</label><textarea id="n-notes" name="notes" rows={2} className="field" /></div>
      <div className="sm:col-span-2 flex items-center gap-3"><Submit>Salvar</Submit><FormMsg state={s} /></div>
    </form>
  );
}
