'use client';
import { useActionState, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { FormMsg, Submit } from '@/components/ui';
import type { Brand, Clinic } from '@/lib/types';
import { createApiKey, inviteMember, saveBrand, saveClinic, saveProcedure, saveProfessional, saveStage } from './actions';

async function upload(clinicId: string, folder: string, f: File) {
  if (f.size > 10 * 1024 * 1024) throw new Error('Máximo 10 MB');
  const ext = f.type === 'image/png' ? 'png' : f.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${clinicId}/${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await createClient().storage.from('clinic-files').upload(path, f, { contentType: f.type });
  if (error) throw new Error(error.message);
  return path;
}

export function ClinicForm({ c, disabled }: { c: Clinic; disabled: boolean }) {
  const [s, act] = useActionState(saveClinic, null);
  const F = (n: keyof Clinic, l: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div><label className="label" htmlFor={`c-${n}`}>{l}</label><input id={`c-${n}`} name={n} defaultValue={(c[n] as string) || ''} className="field" {...extra} /></div>
  );
  return (
    <form action={act} className="card space-y-3">
      <h2 className="font-semibold">Dados da clínica</h2>
      <fieldset disabled={disabled} className="grid gap-3 sm:grid-cols-2">
        {F('name', 'Nome')}{F('whatsapp', 'WhatsApp')}{F('email', 'E-mail', { type: 'email' })}{F('document', 'CNPJ ou CPF')}
        {F('city', 'Cidade')}{F('state', 'UF', { maxLength: 2 })}
        <div className="sm:col-span-2">{F('address', 'Endereço')}</div>
        {F('responsible_name', c.kind === 'odonto' ? 'Responsável técnico' : 'Responsável')}
        {F('responsible_reg', c.kind === 'odonto' ? 'CRO do responsável (ex.: CRO-SP 12345)' : 'Registro profissional')}
        {F('instagram', 'Instagram (@)')}{F('google_review_url', 'Link de avaliação no Google', { type: 'url' })}
      </fieldset>
      {!disabled && <div className="flex items-center gap-3"><Submit>Salvar</Submit><FormMsg state={s} /></div>}
    </form>
  );
}

export function BrandForm({ clinicId, brand, logoUrl, disabled }: { clinicId: string; brand: Brand; logoUrl: string | null; disabled: boolean }) {
  const [b, setB] = useState(brand);
  const [logo, setLogo] = useState<File | null>(null);
  const [preview, setPreview] = useState(logoUrl);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true); setMsg(null);
    try {
      const logo_path = logo ? await upload(clinicId, 'marca', logo) : undefined;
      setMsg(await saveBrand({ ...b, logo_path }));
    } catch (e) { setMsg({ error: (e as Error).message }); } finally { setBusy(false); }
  }
  const C = (k: keyof Brand, l: string) => (
    <div><label className="label" htmlFor={`b-${k}`}>{l}</label><div className="flex gap-2"><input id={`b-${k}`} type="color" value={b[k]} onChange={(e) => setB({ ...b, [k]: e.target.value })} className="h-10 w-14 rounded border border-slate-300" /><input aria-label={`${l} em hexadecimal`} value={b[k]} onChange={(e) => setB({ ...b, [k]: e.target.value })} className="field" /></div></div>
  );
  return (
    <section className="card space-y-3">
      <h2 className="font-semibold">Identidade visual (usada nos criativos)</h2>
      <fieldset disabled={disabled} className="grid gap-3 sm:grid-cols-2">
        {C('primary', 'Cor principal')}{C('accent', 'Cor de destaque')}{C('dark', 'Cor escura')}{C('secondary', 'Cor clara')}
        <div className="sm:col-span-2">
          <label className="label" htmlFor="logo">Logo (PNG com fundo transparente, de preferência)</label>
          <div className="flex items-center gap-4">
            {preview && <img src={preview} alt="Logo atual" className="h-14 max-w-40 rounded border border-slate-200 bg-slate-100 object-contain p-1" />}
            <input id="logo" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { const f = e.target.files?.[0] || null; setLogo(f); if (f) setPreview(URL.createObjectURL(f)); }} className="text-sm" />
          </div>
        </div>
      </fieldset>
      {!disabled && <div className="flex items-center gap-3"><button type="button" onClick={save} disabled={busy} className="btn btn-pri">{busy ? 'Salvando...' : 'Salvar identidade'}</button><FormMsg state={msg} /></div>}
    </section>
  );
}

export interface ProRow { id: string; name: string; specialty: string | null; registration: string | null; bio: string | null; photo_path: string | null; photo: string | null; active: boolean }

export function ProfessionalForm({ clinicId, p, kind }: { clinicId: string; p?: ProRow; kind: 'odonto' | 'estetica' }) {
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true); setMsg(null);
    try {
      const f = fd.get('photo') as File | null;
      const photo_path = f && f.size ? await upload(clinicId, 'profissionais', f) : p?.photo_path ?? null;
      const r = await saveProfessional({
        id: p?.id, name: String(fd.get('name')), specialty: String(fd.get('specialty') || ''), registration: String(fd.get('registration') || ''),
        bio: String(fd.get('bio') || ''), photo_path, active: fd.get('active') === 'on',
      });
      setMsg(r);
      if (!p && r?.ok) e.currentTarget.reset();
    } catch (x) { setMsg({ error: (x as Error).message }); } finally { setBusy(false); }
  }
  const id = p?.id || 'novo';
  return (
    <form onSubmit={onSubmit} className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-[72px_1fr_1fr]">
      <div className="row-span-2">{p?.photo ? <img src={p.photo} alt={`Foto de ${p.name}`} className="h-16 w-16 rounded-full object-cover" /> : <div className="h-16 w-16 rounded-full bg-slate-200" aria-hidden="true" />}</div>
      <div><label className="label" htmlFor={`pn-${id}`}>Nome</label><input id={`pn-${id}`} name="name" required defaultValue={p?.name} className="field" placeholder="Dra. Ana Souza" /></div>
      <div><label className="label" htmlFor={`ps-${id}`}>Especialidade</label><input id={`ps-${id}`} name="specialty" defaultValue={p?.specialty || ''} className="field" /></div>
      <div><label className="label" htmlFor={`pr-${id}`}>{kind === 'odonto' ? 'CRO' : 'Registro'}</label><input id={`pr-${id}`} name="registration" defaultValue={p?.registration || ''} className="field" /></div>
      <div><label className="label" htmlFor={`pf-${id}`}>Foto</label><input id={`pf-${id}`} name="photo" type="file" accept="image/png,image/jpeg,image/webp" className="text-sm" /></div>
      <div className="sm:col-span-2 sm:col-start-2"><label className="label" htmlFor={`pb-${id}`}>Mini bio (a IA usa nos criativos)</label><input id={`pb-${id}`} name="bio" defaultValue={p?.bio || ''} className="field" placeholder="Especialista em implantes, 12 anos de experiência" /></div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2 sm:col-start-2">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={p ? p.active : true} /> Ativo</label>
        <button type="submit" disabled={busy} className="btn btn-sec">{busy ? 'Salvando...' : p ? 'Salvar' : 'Adicionar profissional'}</button>
        <FormMsg state={msg} />
      </div>
    </form>
  );
}

export function ProcedureRow({ p }: { p?: { id: string; name: string; category: string | null; price: number | null; duration_min: number; return_days: number | null; active: boolean } }) {
  const [s, act] = useActionState(saveProcedure, null);
  const id = p?.id || 'novo';
  return (
    <form action={act} className="grid items-end gap-2 border-b border-slate-100 py-2 sm:grid-cols-[1.4fr_1fr_100px_90px_90px_auto]">
      {p && <input type="hidden" name="id" value={p.id} />}
      <div><label className="label text-xs" htmlFor={`n-${id}`}>Procedimento</label><input id={`n-${id}`} name="name" defaultValue={p?.name} required className="field" /></div>
      <div><label className="label text-xs" htmlFor={`c-${id}`}>Categoria</label><input id={`c-${id}`} name="category" defaultValue={p?.category || ''} className="field" /></div>
      <div><label className="label text-xs" htmlFor={`v-${id}`}>Valor (R$)</label><input id={`v-${id}`} name="price" defaultValue={p?.price ?? ''} inputMode="decimal" className="field" /></div>
      <div><label className="label text-xs" htmlFor={`d-${id}`}>Min.</label><input id={`d-${id}`} name="duration_min" type="number" defaultValue={p?.duration_min ?? 60} className="field" /></div>
      <div><label className="label text-xs" htmlFor={`r-${id}`}>Retorno (dias)</label><input id={`r-${id}`} name="return_days" type="number" defaultValue={p?.return_days ?? ''} className="field" /></div>
      <div className="flex items-center gap-2"><Submit variant="sec">{p ? 'Salvar' : 'Adicionar'}</Submit><FormMsg state={s} /></div>
    </form>
  );
}

export function StageRow({ s: st }: { s?: { id: string; name: string; color: string; kind: string } }) {
  const [s, act] = useActionState(saveStage, null);
  const id = st?.id || 'novo';
  return (
    <form action={act} className="flex flex-wrap items-end gap-2 py-1">
      {st && <input type="hidden" name="id" value={st.id} />}
      <div><label className="sr-only" htmlFor={`sn-${id}`}>Nome da etapa</label><input id={`sn-${id}`} name="name" defaultValue={st?.name} placeholder="Nova etapa" required className="field w-56" /></div>
      <div><label className="sr-only" htmlFor={`sc-${id}`}>Cor</label><input id={`sc-${id}`} name="color" type="color" defaultValue={st?.color || '#64748B'} className="h-10 w-12 rounded border border-slate-300" /></div>
      {st && st.kind !== 'open' && <span className="text-xs text-slate-500">{st.kind === 'won' ? 'etapa de ganho' : 'etapa de perda'}</span>}
      <Submit variant="sec">{st ? 'Salvar' : 'Adicionar etapa'}</Submit><FormMsg state={s} />
    </form>
  );
}

export function InviteForm() {
  const [s, act] = useActionState(inviteMember, null);
  return (
    <form action={act} className="flex flex-wrap items-end gap-2">
      <div><label className="label" htmlFor="inv-email">E-mail</label><input id="inv-email" name="email" type="email" required className="field w-64" /></div>
      <div><label className="label" htmlFor="inv-role">Perfil</label><select id="inv-role" name="role" className="field"><option value="staff">Equipe (recepção)</option><option value="admin">Administrador</option></select></div>
      <Submit variant="sec">Convidar</Submit>
      <div className="w-full"><FormMsg state={s} />{s?.link && <p className="mt-1 break-all text-xs">Link: <code>{s.link}</code></p>}</div>
    </form>
  );
}

export function ApiKeyForm() {
  const [s, act] = useActionState(createApiKey, null);
  return (
    <form action={act} className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div><label className="label" htmlFor="key-name">Nome da chave</label><input id="key-name" name="name" defaultValue="n8n automações" className="field w-64" /></div>
        <Submit variant="sec">Criar chave</Submit>
      </div>
      <FormMsg state={s} />
      {s?.key && <p className="break-all rounded bg-slate-900 p-3 font-mono text-xs text-lima">{s.key}</p>}
    </form>
  );
}
