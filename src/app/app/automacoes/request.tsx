'use client';
import { useActionState } from 'react';
import { FormMsg, Submit } from '@/components/ui';
import { AUTOMATION_FLOWS } from '@/lib/plans';
import { requestAutomation } from './actions';

export function RequestForm({ phone, name }: { phone: string; name: string }) {
  const [s, act] = useActionState(requestAutomation, null);
  return (
    <form action={act} className="space-y-4">
      <fieldset>
        <legend className="label">Quais automações você quer? (pode mudar na conversa de instalação)</legend>
        <div className="grid gap-2 md:grid-cols-2">
          {AUTOMATION_FLOWS.map((f) => (
            <label key={f.id} className="flex cursor-pointer gap-3 rounded-lg border border-slate-200 p-3 has-[:checked]:border-ink has-[:checked]:bg-slate-50">
              <input type="checkbox" name="flows" value={f.id} defaultChecked={['C1', 'C3', 'C6', 'B1'].includes(f.id)} className="mt-1" />
              <span className="text-sm"><b>{f.nome}</b><br /><span className="text-slate-600">{f.desc}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="rq-n">Quem acompanha a instalação</label><input id="rq-n" name="contact_name" defaultValue={name} required className="field" /></div>
        <div><label className="label" htmlFor="rq-p">WhatsApp para contato</label><input id="rq-p" name="contact_phone" defaultValue={phone} required className="field" /></div>
      </div>
      <div><label className="label" htmlFor="rq-o">Observações</label><textarea id="rq-o" name="notes" rows={2} className="field" placeholder="Sistema de agenda que vocês usam, número que vai enviar as mensagens..." /></div>
      <div className="flex items-center gap-3"><Submit variant="lima">Solicitar instalação</Submit><FormMsg state={s} /></div>
    </form>
  );
}
