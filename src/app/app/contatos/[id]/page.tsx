import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getContext } from '@/lib/clinic';
import { PageHeader, Badge } from '@/components/bits';
import { fmtDateTime, fmtPhone, waLink, firstName } from '@/lib/utils';
import type { Contact } from '@/lib/types';
import { completeTask, deleteContact } from '../../crm-actions';
import { AiFollowup, DealRow, EditContact, NewActivity, NewDeal } from './forms';

const TYPE: Record<string, string> = { nota: 'Nota', ligacao: 'Ligação', whatsapp: 'WhatsApp', email: 'E-mail', tarefa: 'Tarefa', etapa: 'Funil', sistema: 'Sistema' };

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, clinic, writable, isAdmin } = await getContext();
  const { data: c } = await supabase.from('contacts').select('*').eq('id', id).eq('clinic_id', clinic.id).maybeSingle();
  if (!c) notFound();
  const [deals, stages, acts, appts, procs] = await Promise.all([
    supabase.from('deals').select('id, title, value, stage_id, lost_reason').eq('contact_id', id).order('created_at'),
    supabase.from('stages').select('id, name').eq('clinic_id', clinic.id).order('position'),
    supabase.from('activities').select('id, type, body, due_at, done_at, created_at').eq('contact_id', id).order('created_at', { ascending: false }).limit(100),
    supabase.from('appointments').select('id, starts_at, status, procedure:procedures(name)').eq('contact_id', id).order('starts_at', { ascending: false }).limit(20),
    supabase.from('procedures').select('id, name').eq('clinic_id', clinic.id).eq('active', true).order('name'),
  ]);
  const contact = c as Contact;
  return (
    <>
      <PageHeader title={contact.name} desc={[fmtPhone(contact.phone), contact.email].filter(Boolean).join(' · ')}>
        {contact.phone && <a className="btn btn-sec" target="_blank" rel="noreferrer" href={waLink(contact.phone, `Oi, ${firstName(contact.name)}!`)}>WhatsApp</a>}
        <Link className="btn btn-sec" href={`/app/agenda?contato=${contact.id}`}>Agendar</Link>
        {isAdmin && writable && (
          <form action={deleteContact}><input type="hidden" name="id" value={contact.id} /><button className="btn btn-danger" type="submit">Excluir (LGPD)</button></form>
        )}
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <section className="card">
            <h2 className="font-semibold">Oportunidades</h2>
            {(deals.data || []).map((d) => <DealRow key={d.id} d={{ ...d, value: Number(d.value) }} stages={stages.data || []} contactId={contact.id} readOnly={!writable} />)}
            {writable && <NewDeal contactId={contact.id} procedures={procs.data || []} />}
          </section>
          <EditContact c={contact} readOnly={!writable} />
        </div>
        <div className="space-y-6">
          {writable && <AiFollowup contactId={contact.id} phone={contact.phone} />}
          <section className="card">
            <h2 className="mb-3 font-semibold">Linha do tempo</h2>
            {writable && <NewActivity contactId={contact.id} />}
            <ol className="mt-4 space-y-3">
              {(acts.data || []).map((a) => (
                <li key={a.id} className="border-l-2 border-slate-200 pl-3 text-sm">
                  <p className="text-xs text-slate-500">{TYPE[a.type]} · {fmtDateTime(a.created_at)}{a.due_at && ` · prazo ${fmtDateTime(a.due_at)}`}</p>
                  <p className="whitespace-pre-line">{a.body}</p>
                  {a.type === 'tarefa' && !a.done_at && writable && (
                    <form action={completeTask}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="contact_id" value={contact.id} /><button className="mt-1 text-xs font-semibold underline" type="submit">Marcar como feita</button></form>
                  )}
                  {a.done_at && <Badge tone="green">feita</Badge>}
                </li>
              ))}
            </ol>
          </section>
          <section className="card">
            <h2 className="mb-2 font-semibold">Consultas</h2>
            <ul className="space-y-1 text-sm">
              {(appts.data || []).map((a) => <li key={a.id}>{fmtDateTime(a.starts_at)} · {(a.procedure as unknown as { name: string } | null)?.name || 'Consulta'} <Badge>{a.status}</Badge></li>)}
              {!appts.data?.length && <li className="text-slate-500">Nenhuma consulta.</li>}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
