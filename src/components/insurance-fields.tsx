'use client';
import { useState } from 'react';
import { insKey } from '@/lib/insurance';

/** Campos de convênio do paciente (vazio = particular). Aparece quando a clínica atende convênio. */
export function InsuranceFields({ list, accepts, c, idp }: {
  list: string[]; accepts: boolean; idp: string;
  c?: { insurance?: string | null; insurance_card?: string | null; insurance_plan?: string | null; insurance_valid?: string | null };
}) {
  const [name, setName] = useState(c?.insurance || '');
  if (!accepts && !c?.insurance) return null;
  const known = !name.trim() || list.some((x) => insKey(x) === insKey(name));
  return (
    <>
      <div>
        <label className="label" htmlFor={`${idp}-ins`}>Convênio</label>
        <input id={`${idp}-ins`} name="insurance" list={`${idp}-ins-l`} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Particular (sem convênio)" autoComplete="off" className="field" />
        <datalist id={`${idp}-ins-l`}>{list.map((x) => <option key={x} value={x} />)}</datalist>
        {!known && <p className="mt-1 text-xs text-amber-700">A clínica não atende esse convênio: as consultas saem como particular.</p>}
      </div>
      {name.trim() && (
        <>
          <div><label className="label" htmlFor={`${idp}-card`}>Nº da carteirinha</label><input id={`${idp}-card`} name="insurance_card" maxLength={40} defaultValue={c?.insurance_card || ''} className="field" /></div>
          <div><label className="label" htmlFor={`${idp}-plan`}>Plano</label><input id={`${idp}-plan`} name="insurance_plan" maxLength={80} defaultValue={c?.insurance_plan || ''} placeholder="Ex.: Dental Pleno" className="field" /></div>
          <div><label className="label" htmlFor={`${idp}-val`}>Validade da carteirinha</label><input id={`${idp}-val`} name="insurance_valid" type="date" defaultValue={c?.insurance_valid || ''} className="field" /></div>
        </>
      )}
    </>
  );
}
