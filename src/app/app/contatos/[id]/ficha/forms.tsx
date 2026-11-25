'use client';
import { useActionState, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { FormMsg, Submit } from '@/components/ui';
import { ANAMNESE_FLAGS, ANAMNESE_TEXTS, type Anamnese } from '@/lib/anamnese';
import { addClinicalNote, registerPatientFile, saveAnamnese } from './actions';

export function AnamneseForm({ contactId, data, disabled }: { contactId: string; data: Anamnese; disabled: boolean }) {
  const [s, act] = useActionState(saveAnamnese, null);
  return (
    <form action={act} className="card space-y-3">
      <h2 className="font-semibold">Anamnese</h2>
      <input type="hidden" name="contact_id" value={contactId} />
      <fieldset disabled={disabled} className="space-y-3">
        <legend className="sr-only">Saúde do paciente</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {ANAMNESE_FLAGS.map(([k, l]) => <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" name={k} defaultChecked={!!data[k]} /> {l}</label>)}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {ANAMNESE_TEXTS.map(([k, l]) => (
            <div key={k} className={k === 'observacoes' || k === 'queixa' ? 'sm:col-span-2' : ''}>
              <label className="label" htmlFor={`an-${k}`}>{l}</label>
              <textarea id={`an-${k}`} name={k} rows={2} maxLength={2000} defaultValue={(data[k] as string) || ''} className="field" />
            </div>
          ))}
        </div>
      </fieldset>
      {!disabled && <div className="flex items-center gap-3"><Submit>Salvar anamnese</Submit><FormMsg state={s} /></div>}
    </form>
  );
}

export function NoteForm({ contactId, pros, appts }: { contactId: string; pros: { id: string; name: string }[]; appts: { id: string; label: string }[] }) {
  const [s, act] = useActionState(addClinicalNote, null);
  return (
    <form key={s?.ok ? Date.now() : 'f'} action={act} className="space-y-2">
      <input type="hidden" name="contact_id" value={contactId} />
      <div className="flex flex-wrap gap-2">
        {pros.length > 0 && <><label className="sr-only" htmlFor="nt-p">Profissional</label><select id="nt-p" name="professional_id" className="field w-56"><option value="">Profissional</option>{pros.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></>}
        {appts.length > 0 && <><label className="sr-only" htmlFor="nt-a">Consulta</label><select id="nt-a" name="appointment_id" className="field w-64"><option value="">Consulta (opcional)</option>{appts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></>}
      </div>
      <label className="sr-only" htmlFor="nt-b">Evolução</label>
      <textarea id="nt-b" name="body" rows={4} required maxLength={5000} className="field" placeholder="O que foi feito, materiais e produtos usados, como o paciente reagiu, orientações e próximo passo." />
      <div className="flex items-center gap-3"><Submit>Registrar evolução</Submit><FormMsg state={s} /></div>
      <p className="text-xs text-slate-500">A evolução não pode ser editada nem apagada depois de registrada (fica o histórico). Para corrigir, registre uma nova.</p>
    </form>
  );
}

export function PhotoUpload({ clinicId, contactId }: { clinicId: string; contactId: string }) {
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const files = (fd.getAll('photos') as File[]).filter((f) => f.size);
    if (!files.length) { setMsg({ error: 'Escolha pelo menos uma foto.' }); return; }
    setBusy(true); setMsg(null);
    try {
      for (const f of files) {
        if (f.size > 10 * 1024 * 1024) throw new Error(`${f.name}: máximo 10 MB`);
        if (!/^image\/(png|jpeg|webp)$/.test(f.type)) throw new Error(`${f.name}: use JPG, PNG ou WEBP`);
        const ext = f.type === 'image/png' ? 'png' : f.type === 'image/webp' ? 'webp' : 'jpg';
        const path = `${clinicId}/pacientes/${contactId}/${crypto.randomUUID()}.${ext}`;
        const { error } = await createClient().storage.from('clinic-files').upload(path, f, { contentType: f.type });
        if (error) throw new Error(error.message);
        const r = await registerPatientFile({ contact_id: contactId, path, caption: String(fd.get('caption') || ''), taken_at: String(fd.get('taken_at') || '') });
        if (r?.error) throw new Error(r.error);
      }
      setMsg({ ok: files.length > 1 ? `${files.length} fotos salvas.` : 'Foto salva.' });
      form.reset();
    } catch (x) { setMsg({ error: (x as Error).message }); } finally { setBusy(false); }
  }
  const today = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
      <div><label className="label" htmlFor="ph-f">Fotos (antes, durante, depois)</label><input id="ph-f" name="photos" type="file" multiple accept="image/png,image/jpeg,image/webp" className="text-sm" /></div>
      <div><label className="label" htmlFor="ph-c">Legenda</label><input id="ph-c" name="caption" maxLength={200} placeholder="Antes · arcada superior" className="field w-56" /></div>
      <div><label className="label" htmlFor="ph-d">Data</label><input id="ph-d" name="taken_at" type="date" defaultValue={today} className="field" /></div>
      <button type="submit" disabled={busy} className="btn btn-sec">{busy ? 'Enviando...' : 'Enviar fotos'}</button>
      <FormMsg state={msg} />
    </form>
  );
}
