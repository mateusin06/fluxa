import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getContext } from '@/lib/clinic';
import { PageHeader, Empty } from '@/components/bits';
import { signMany } from '@/lib/signed';
import { fmtDate, fmtDateTime } from '@/lib/utils';
import { ANAMNESE_FLAGS, type Anamnese } from '@/lib/anamnese';
import { AnamneseForm, NoteForm, PhotoUpload } from './forms';
import { deletePatientFile } from './actions';

export const metadata = { title: 'Ficha clínica' };
const nm = (x: unknown) => (x as { name: string } | null)?.name || '';

export default async function FichaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, clinic, writable, user, role } = await getContext();
  const { data: mem } = await supabase.from('memberships').select('clinical_access').eq('clinic_id', clinic.id).eq('user_id', user.id).maybeSingle();
  const { data: c } = await supabase.from('contacts').select('id, name, birth_date').eq('id', id).eq('clinic_id', clinic.id).maybeSingle();
  if (!c) notFound();
  if (!(role === 'owner' || mem?.clinical_access)) {
    return (
      <>
        <PageHeader title={`Ficha clínica · ${c.name}`} />
        <Empty title="Você não tem acesso à ficha clínica">Peça ao dono da clínica para ligar o acesso em <Link className="underline" href="/app/configuracoes">Clínica e equipe</Link>.</Empty>
      </>
    );
  }
  const [an, notes, files, pros, appts] = await Promise.all([
    supabase.from('anamneses').select('data, updated_at, updated_by').eq('contact_id', id).maybeSingle(),
    supabase.from('clinical_notes').select('id, body, created_at, created_by, professional:professionals(name), appointment:appointments(starts_at, procedure_text, procedure:procedures(name))').eq('contact_id', id).order('created_at', { ascending: false }).limit(200),
    supabase.from('patient_files').select('id, path, caption, taken_at, created_at').eq('contact_id', id).order('created_at', { ascending: false }).limit(200),
    supabase.from('professionals').select('id, name').eq('clinic_id', clinic.id).eq('active', true).order('name'),
    supabase.from('appointments').select('id, starts_at, procedure_text, procedure:procedures(name)').eq('contact_id', id).in('status', ['realizado', 'confirmado', 'agendado']).order('starts_at', { ascending: false }).limit(20),
  ]);
  const authorIds = [...new Set([...(notes.data || []).map((n) => n.created_by), an.data?.updated_by].filter(Boolean))] as string[];
  const { data: authors } = authorIds.length ? await supabase.from('profiles').select('id, full_name').in('id', authorIds) : { data: [] };
  const who = new Map((authors || []).map((a) => [a.id, a.full_name]));
  const urls = await signMany(supabase, (files.data || []).map((f) => f.path));
  const data = (an.data?.data || {}) as Anamnese;
  const alerts = [data.alergias && `Alergias: ${data.alergias}`, ...ANAMNESE_FLAGS.filter(([k]) => data[k]).map(([, l]) => l)].filter(Boolean);
  const age = c.birth_date ? Math.floor((Date.now() - new Date(c.birth_date + 'T12:00:00Z').getTime()) / (365.25 * 86400000)) : null;

  return (
    <>
      <PageHeader title={`Ficha clínica · ${c.name}`} desc={[age !== null && `${age} anos`, an.data?.updated_at && `Anamnese atualizada em ${fmtDateTime(an.data.updated_at)}${an.data.updated_by ? ` por ${who.get(an.data.updated_by) || 'equipe'}` : ''}`].filter(Boolean).join(' · ')}>
        <Link className="btn btn-sec" href={`/app/contatos/${id}`}>Voltar ao paciente</Link>
      </PageHeader>
      {alerts.length > 0 && (
        <div role="note" className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <p className="font-semibold">Atenção antes de atender</p>
          <p>{alerts.join(' · ')}</p>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <div className="space-y-6">
          <AnamneseForm contactId={id} data={data} disabled={!writable} />
          <section className="card space-y-3" aria-labelledby="fotos">
            <h2 id="fotos" className="font-semibold">Fotos</h2>
            {writable && <PhotoUpload clinicId={clinic.id} contactId={id} />}
            {files.data?.length ? (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {files.data.map((f) => (
                  <li key={f.id} className="space-y-1">
                    {urls[f.path] ? <a href={urls[f.path]} target="_blank" rel="noreferrer"><img src={urls[f.path]} alt={f.caption || `Foto de ${fmtDate(f.taken_at || f.created_at)}`} className="aspect-square w-full rounded-lg object-cover" /></a> : <div className="aspect-square rounded-lg bg-slate-100" />}
                    <p className="text-xs text-slate-600">{fmtDate(f.taken_at ? f.taken_at + 'T12:00:00Z' : f.created_at)}{f.caption ? ` · ${f.caption}` : ''}</p>
                    {writable && <form action={deletePatientFile}><input type="hidden" name="id" value={f.id} /><button className="text-xs text-red-700 underline" type="submit">Excluir</button></form>}
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-slate-500">Nenhuma foto.</p>}
            <p className="text-xs text-slate-500">Fotos ficam privadas: só quem tem acesso à ficha clínica vê. Para usar em anúncio, é preciso autorização por escrito do paciente e as regras do conselho.</p>
          </section>
        </div>
        <section className="card space-y-4" aria-labelledby="evol">
          <h2 id="evol" className="font-semibold">Evolução</h2>
          {writable && <NoteForm contactId={id} pros={pros.data || []} appts={(appts.data || []).map((a) => ({ id: a.id, label: `${fmtDateTime(a.starts_at)} · ${nm(a.procedure) || a.procedure_text || 'Consulta'}` }))} />}
          <ol className="space-y-3">
            {(notes.data || []).map((n) => {
              const ap = n.appointment as unknown as { starts_at: string; procedure_text: string | null; procedure: { name: string } | null } | null;
              return (
                <li key={n.id} className="border-l-2 border-slate-200 pl-3 text-sm">
                  <p className="text-xs text-slate-500">{fmtDateTime(n.created_at)} · {who.get(n.created_by) || 'equipe'}{nm(n.professional) && ` · ${nm(n.professional)}`}{ap && ` · consulta de ${fmtDate(ap.starts_at)} (${ap.procedure?.name || ap.procedure_text || 'consulta'})`}</p>
                  <p className="whitespace-pre-line">{n.body}</p>
                </li>
              );
            })}
            {!notes.data?.length && <li className="text-sm text-slate-500">Nenhuma evolução registrada.</li>}
          </ol>
        </section>
      </div>
    </>
  );
}
