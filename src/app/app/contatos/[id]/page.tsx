import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getContext } from '@/lib/clinic';
import { PageHeader, Badge } from '@/components/bits';
import { fmtDate, fmtDateTime, fmtPhone, waLink, firstName, money } from '@/lib/utils';
import type { Contact } from '@/lib/types';
import { completeTask, deleteContact } from '../../crm-actions';
import { AiFollowup, DealRow, EditContact, NewActivity, NewDeal } from './forms';

const TYPE: Record<string, string> = { nota: 'Nota', ligacao: 'Ligação', whatsapp: 'WhatsApp', email: 'E-mail', tarefa: 'Tarefa', etapa: 'Funil', sistema: 'Sistema' };

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, clinic, writable, isAdmin, role, user } = await getContext();
  const { data: c } = await supabase.from('contacts').select('*').eq('id', id).eq('clinic_id', clinic.id).maybeSingle();
  if (!c) notFound();
  const [deals, stages, acts, appts, procs, quotes, mem] = await Promise.all([
    supabase.from('deals').select('id, title, value, stage_id, lost_reason').eq('contact_id', id).order('created_at'),
    supabase.from('stages').select('id, name').eq('clinic_id', clinic.id).order('position'),
    supabase.from('activities').select('id, type, body, due_at, done_at, created_at').eq('contact_id', id).order('created_at', { ascending: false }).limit(100),
    supabase.from('appointments').select('id, starts_at, status, procedure_text, procedure:procedures(name)').eq('contact_id', id).order('starts_at', { ascending: false }).limit(20),
    supabase.from('procedures').select('id, name').eq('clinic_id', clinic.id).eq('active', true).order('name'),
    supabase.from('quotes').select('id, number, status, discount, created_at, quote_items(id, description, region, qty, unit_price, position)').eq('contact_id', id).order('created_at', { ascending: false }),
    supabase.from('memberships').select('clinical_access').eq('clinic_id', clinic.id).eq('user_id', user.id).maybeSingle(),
  ]);
  const clinical = role === 'owner' || !!mem.data?.clinical_access;
  // sessões dos planos aprovados: quantas já foram agendadas/feitas
  const planItems = (quotes.data || []).filter((q) => q.status === 'aprovado').flatMap((q) => (q.quote_items as { id: string; description: string; region: string | null; qty: number; position: number }[]).map((i) => ({ ...i, number: q.number })));
  const { data: used } = planItems.length ? await supabase.from('appointments').select('quote_item_id, status').in('quote_item_id', planItems.map((i) => i.id)).not('status', 'in', '(cancelado,faltou)') : { data: [] };
  const usedBy = new Map<string, { n: number; done: number }>();
  (used || []).forEach((a) => { const u = usedBy.get(a.quote_item_id as string) || { n: 0, done: 0 }; u.n++; if (a.status === 'realizado') u.done++; usedBy.set(a.quote_item_id as string, u); });
  const qTotal = (q: { discount: number; quote_items: { qty: number; unit_price: number }[] }) => Math.max(0, q.quote_items.reduce((a, i) => a + i.qty * Number(i.unit_price), 0) - Number(q.discount));
  const contact = c as Contact;
  return (
    <>
      <PageHeader title={contact.name} desc={[fmtPhone(contact.phone), contact.email].filter(Boolean).join(' · ')}>
        {contact.phone && <a className="btn btn-sec" target="_blank" rel="noreferrer" href={waLink(contact.phone, `Oi, ${firstName(contact.name)}!`)}>WhatsApp</a>}
        <Link className="btn btn-sec" href={`/app/agenda?contato=${contact.id}`}>Agendar</Link>
        {writable && <Link className="btn btn-sec" href={`/app/orcamentos?contato=${contact.id}`}>Novo orçamento</Link>}
        {clinical && <Link className="btn btn-sec" href={`/app/contatos/${contact.id}/ficha`}>Ficha clínica</Link>}
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
          {planItems.length > 0 && (
            <section className="card" aria-labelledby="plano">
              <h2 id="plano" className="mb-2 font-semibold">Plano de tratamento: sessões</h2>
              <ul className="divide-y divide-slate-100 text-sm">
                {planItems.map((i) => {
                  const u = usedBy.get(i.id) || { n: 0, done: 0 };
                  const falta = i.qty - u.n;
                  return (
                    <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span>{i.description}{i.region ? ` · ${i.region}` : ''} <span className="text-slate-500">(orç. nº {i.number})</span></span>
                      <span className="flex items-center gap-2">
                        <Badge tone={u.done >= i.qty ? 'green' : 'slate'}>{u.done}/{i.qty} feitas{u.n > u.done ? ` · ${u.n - u.done} agendada(s)` : ''}</Badge>
                        {writable && falta > 0 && <Link className="btn btn-sec min-h-8 px-2 py-1 text-xs" href={`/app/agenda?contato=${contact.id}&item=${i.id}`}>Agendar sessão</Link>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {(quotes.data || []).length > 0 && (
            <section className="card" aria-labelledby="orcs">
              <h2 id="orcs" className="mb-2 font-semibold">Orçamentos</h2>
              <ul className="divide-y divide-slate-100 text-sm">
                {(quotes.data || []).map((q) => (
                  <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <Link className="underline" href={`/app/orcamentos/${q.id}`}>Nº {q.number} · {fmtDate(q.created_at)}</Link>
                    <span className="flex items-center gap-2"><b>{money(qTotal(q as never))}</b><Badge tone={q.status === 'aprovado' ? 'green' : q.status === 'recusado' ? 'red' : q.status === 'enviado' ? 'amber' : 'slate'}>{q.status}</Badge></span>
                  </li>
                ))}
              </ul>
            </section>
          )}
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
              {(appts.data || []).map((a) => <li key={a.id}>{fmtDateTime(a.starts_at)} · {(a.procedure as unknown as { name: string } | null)?.name || a.procedure_text || 'Consulta'} <Badge>{a.status}</Badge></li>)}
              {!appts.data?.length && <li className="text-slate-500">Nenhuma consulta.</li>}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
