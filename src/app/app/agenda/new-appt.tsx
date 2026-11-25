'use client';
import { useActionState } from 'react';
import { FormMsg, Submit } from '@/components/ui';
import { createAppointment } from './actions';

interface Opt { id: string; name: string }
export function NewAppointment({ contacts, pros, procs, preset }: { contacts: Opt[]; pros: Opt[]; procs: (Opt & { duration_min: number })[]; preset?: string }) {
  const [s, act] = useActionState(createAppointment, null);
  return (
    <form action={act} className="card grid gap-3 sm:grid-cols-3">
      <h2 className="font-semibold sm:col-span-3">Nova consulta</h2>
      <div><label className="label" htmlFor="ap-c">Paciente</label><select id="ap-c" name="contact_id" defaultValue={preset || ''} className="field"><option value="">Escolha</option>{contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      <div><label className="label" htmlFor="ap-p">Profissional</label><select id="ap-p" name="professional_id" className="field"><option value="">—</option>{pros.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      <div><label className="label" htmlFor="ap-pr">Procedimento</label><select id="ap-pr" name="procedure_id" className="field"><option value="">—</option>{procs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      <div><label className="label" htmlFor="ap-s">Data e hora</label><input id="ap-s" name="starts_at" type="datetime-local" required className="field" /></div>
      <div><label className="label" htmlFor="ap-d">Duração (min)</label><input id="ap-d" name="duration" type="number" min={5} max={600} defaultValue={60} className="field" /></div>
      <div><label className="label" htmlFor="ap-n">Observação</label><input id="ap-n" name="notes" className="field" /></div>
      <label className="flex items-center gap-2 text-sm sm:col-span-3"><input type="checkbox" name="livre" /> Horário livre (sem paciente): fica disponível para as automações oferecerem a quem chamar pelo anúncio</label>
      <div className="flex items-center gap-3 sm:col-span-3"><Submit>Agendar</Submit><FormMsg state={s} /></div>
    </form>
  );
}
