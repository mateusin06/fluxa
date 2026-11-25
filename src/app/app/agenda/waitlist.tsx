'use client';
import { useActionState } from 'react';
import { FormMsg, Submit } from '@/components/ui';
import { PatientPicker } from '@/components/patient-picker';
import { addWaitlist } from './actions';

export function AddWaitlist({ procs }: { procs: { id: string; name: string }[] }) {
  const [s, act] = useActionState(addWaitlist, null);
  return (
    <form action={act} className="flex flex-wrap items-end gap-2">
      <PatientPicker required className="w-64" />
      <div><label className="label" htmlFor="w-p">Procedimento</label><select id="w-p" name="procedure_id" className="field w-48"><option value="">Qualquer</option>{procs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      <Submit variant="sec">Adicionar à espera</Submit><FormMsg state={s} />
    </form>
  );
}
