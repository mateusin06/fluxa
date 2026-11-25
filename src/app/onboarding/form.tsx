'use client';
import { useActionState } from 'react';
import { FormMsg, Submit } from '@/components/ui';
import { createClinic } from './actions';

export function OnboardingForm() {
  const [s, act] = useActionState(createClinic, null);
  return (
    <form action={act} className="space-y-4">
      <div><label className="label" htmlFor="name">Nome da clínica</label><input id="name" name="name" required className="field" placeholder="Clínica Sorriso" /></div>
      <fieldset>
        <legend className="label">Tipo de clínica</legend>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 p-3 has-[:checked]:border-ink has-[:checked]:bg-slate-50"><input type="radio" name="kind" value="odonto" defaultChecked /> Odontológica</label>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 p-3 has-[:checked]:border-ink has-[:checked]:bg-slate-50"><input type="radio" name="kind" value="estetica" /> Estética</label>
        </div>
      </fieldset>
      <div><label className="label" htmlFor="phone">WhatsApp da clínica</label><input id="phone" name="phone" inputMode="tel" required className="field" placeholder="(19) 99999-0000" /></div>
      <div className="grid grid-cols-[1fr_80px] gap-2">
        <div><label className="label" htmlFor="city">Cidade</label><input id="city" name="city" className="field" /></div>
        <div><label className="label" htmlFor="state">UF</label><input id="state" name="state" maxLength={2} className="field uppercase" /></div>
      </div>
      <FormMsg state={s} />
      <Submit className="w-full" pending="Criando...">Criar minha clínica</Submit>
    </form>
  );
}
