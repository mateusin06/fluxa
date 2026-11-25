import Link from 'next/link';
import { getContext } from '@/lib/clinic';
import { PageHeader, Badge } from '@/components/bits';
import { fmtTime } from '@/lib/utils';
import { NewAppointment } from './new-appt';
import { setAppointmentStatus, setWaitlistStatus } from './actions';
import { AddWaitlist } from './waitlist';
import { fmtDate } from '@/lib/utils';

export const metadata = { title: 'Agenda' };
const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const TONE = { livre: 'violet', agendado: 'slate', confirmado: 'green', remarcar: 'amber', realizado: 'blue', faltou: 'red', cancelado: 'amber' } as const;

function mondayOf(dateStr?: string) {
  const base = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? new Date(dateStr + 'T12:00:00-03:00') : new Date();
  const local = new Date(base.getTime() - 3 * 3600000);
  const dow = local.getUTCDay();
  local.setUTCDate(local.getUTCDate() - ((dow + 6) % 7));
  return local.toISOString().slice(0, 10);
}

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ semana?: string; contato?: string }> }) {
  const { supabase, clinic, writable } = await getContext();
  const sp = await searchParams;
  const monday = mondayOf(sp.semana);
  const start = new Date(monday + 'T00:00:00-03:00');
  const end = new Date(start.getTime() + 7 * 86400000);
  const shift = (d: number) => new Date(start.getTime() + d * 86400000 + 12 * 3600000).toISOString().slice(0, 10);

  const [appts, contacts, pros, procs, wait] = await Promise.all([
    supabase.from('appointments').select('id, starts_at, status, contact_id, contact:contacts(name), professional:professionals(name), procedure:procedures(name)')
      .eq('clinic_id', clinic.id).gte('starts_at', start.toISOString()).lt('starts_at', end.toISOString()).order('starts_at'),
    supabase.from('contacts').select('id, name').eq('clinic_id', clinic.id).order('updated_at', { ascending: false }).limit(500),
    supabase.from('professionals').select('id, name').eq('clinic_id', clinic.id).eq('active', true).order('name'),
    supabase.from('procedures').select('id, name, duration_min').eq('clinic_id', clinic.id).eq('active', true).order('name'),
    supabase.from('waitlist').select('id, status, created_at, contact_id, contact:contacts(name), procedure:procedures(name), procedure_text').eq('clinic_id', clinic.id).in('status', ['aguardando', 'ofertado']).order('created_at'),
  ]);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d0 = new Date(start.getTime() + i * 86400000);
    const d1 = new Date(d0.getTime() + 86400000);
    const label = new Date(d0.getTime() + 12 * 3600000);
    return {
      key: i, title: `${DOW[label.getUTCDay()]} ${String(label.getUTCDate()).padStart(2, '0')}/${String(label.getUTCMonth() + 1).padStart(2, '0')}`,
      items: (appts.data || []).filter((a) => new Date(a.starts_at) >= d0 && new Date(a.starts_at) < d1),
    };
  });
  const name = (x: unknown) => (x as { name: string } | null)?.name || '';

  return (
    <>
      <PageHeader title="Agenda" desc="Semana a semana. Confirme, marque falta ou realizado: isso alimenta o painel e as automações.">
        <Link className="btn btn-sec" href={`/app/agenda?semana=${shift(-7)}`}>‹ Semana anterior</Link>
        <Link className="btn btn-sec" href="/app/agenda">Hoje</Link>
        <Link className="btn btn-sec" href={`/app/agenda?semana=${shift(7)}`}>Próxima ›</Link>
      </PageHeader>
      {writable && <div className="mb-6"><NewAppointment contacts={contacts.data || []} pros={pros.data || []} procs={procs.data || []} preset={sp.contato} /></div>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
        {days.map((d) => (
          <section key={d.key} className="rounded-xl bg-white p-3 shadow-sm" aria-label={d.title}>
            <h2 className="mb-2 text-sm font-semibold">{d.title}</h2>
            <ul className="space-y-2">
              {d.items.map((a) => (
                <li key={a.id} className="rounded-lg border border-slate-200 p-2 text-xs">
                  <p className="font-semibold">{fmtTime(a.starts_at)} · {a.contact_id ? <Link className="underline" href={`/app/contatos/${a.contact_id}`}>{name(a.contact)}</Link> : <span className="text-violet-700">Horário livre</span>}</p>
                  <p className="text-slate-600">{[name(a.procedure), name(a.professional)].filter(Boolean).join(' · ')}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <Badge tone={TONE[a.status as keyof typeof TONE]}>{a.status}</Badge>
                    {writable && a.contact_id && (['confirmado', 'realizado', 'faltou', 'cancelado'] as const).filter((s) => s !== a.status).map((s) => (
                      <form key={s} action={setAppointmentStatus}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="status" value={s} /><button className="rounded border border-slate-200 px-1.5 py-0.5 hover:bg-slate-50" type="submit">{s}</button></form>
                    ))}
                  </div>
                </li>
              ))}
              {!d.items.length && <li className="text-xs text-slate-400">Livre</li>}
            </ul>
          </section>
        ))}
      </div>
      <section className="card mt-6 space-y-3" aria-labelledby="espera">
        <h2 id="espera" className="font-semibold">Lista de espera</h2>
        <p className="text-sm text-slate-600">Com a automação de lista de espera ativa, quando uma consulta é cancelada o horário é oferecido a esses pacientes pelo WhatsApp, na ordem de chegada.</p>
        {writable && <AddWaitlist contacts={contacts.data || []} procs={procs.data || []} />}
        <ul className="divide-y divide-slate-100 text-sm">
          {(wait.data || []).map((w) => (
            <li key={w.id} className="flex flex-wrap items-center gap-2 py-2">
              <Link className="font-medium underline" href={`/app/contatos/${w.contact_id}`}>{name(w.contact)}</Link>
              <span className="text-slate-500">{name(w.procedure) || w.procedure_text || 'qualquer procedimento'} · desde {fmtDate(w.created_at)}</span>
              <Badge tone={w.status === 'ofertado' ? 'amber' : 'slate'}>{w.status}</Badge>
              {writable && (['agendado', 'cancelado'] as const).map((st) => (
                <form key={st} action={setWaitlistStatus}><input type="hidden" name="id" value={w.id} /><input type="hidden" name="status" value={st} /><button className="rounded border border-slate-200 px-2 py-0.5 text-xs hover:bg-slate-50" type="submit">{st === 'agendado' ? 'Agendou' : 'Remover'}</button></form>
              ))}
            </li>
          ))}
          {!wait.data?.length && <li className="py-2 text-slate-500">Ninguém na espera.</li>}
        </ul>
      </section>
    </>
  );
}
