import Link from 'next/link';
import { getContext } from '@/lib/clinic';
import { PageHeader, Badge } from '@/components/bits';
import { fmtTime, money } from '@/lib/utils';
import { NewAppointment } from './new-appt';
import { markChargePaid, setAppointmentStatus, setWaitlistStatus } from './actions';
import { AddWaitlist } from './waitlist';
import { fmtDate } from '@/lib/utils';
import { freeGaps, type Hour } from '@/lib/slots';
import { loadSchedule } from '@/lib/schedule';

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

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ semana?: string; contato?: string; inicio?: string }> }) {
  const { supabase, clinic, writable } = await getContext();
  const sp = await searchParams;
  const monday = mondayOf(sp.semana);
  const start = new Date(monday + 'T00:00:00-03:00');
  const end = new Date(start.getTime() + 7 * 86400000);
  const shift = (d: number) => new Date(start.getTime() + d * 86400000 + 12 * 3600000).toISOString().slice(0, 10);

  const [appts, preset, pros, procs, wait, sched] = await Promise.all([
    supabase.from('appointments').select('id, starts_at, ends_at, status, contact_id, procedure_text, price, contact:contacts(name), professional:professionals(name), procedure:procedures(name)')
      .eq('clinic_id', clinic.id).gte('starts_at', start.toISOString()).lt('starts_at', end.toISOString()).order('starts_at'),
    sp.contato && /^[0-9a-f-]{36}$/.test(sp.contato) ? supabase.from('contacts').select('id, name').eq('clinic_id', clinic.id).eq('id', sp.contato).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('professionals').select('id, name').eq('clinic_id', clinic.id).eq('active', true).order('name'),
    supabase.from('procedures').select('id, name, duration_min, price').eq('clinic_id', clinic.id).eq('active', true).order('name'),
    supabase.from('waitlist').select('id, status, created_at, contact_id, contact:contacts(name), procedure:procedures(name), procedure_text').eq('clinic_id', clinic.id).in('status', ['aguardando', 'ofertado']).order('created_at'),
    loadSchedule(supabase, clinic.id),
  ]);
  const ids = (appts.data || []).filter((a) => a.status === 'realizado').map((a) => a.id);
  const { data: chs } = ids.length ? await supabase.from('charges').select('id, appointment_id, status, amount, meta').in('appointment_id', ids).neq('status', 'cancelado') : { data: [] };
  const chargeOf = new Map((chs || []).map((c) => [c.appointment_id as string, c]));
  const busy = (appts.data || []).filter((a) => !['cancelado', 'livre'].includes(a.status)).map((a) => ({ start: new Date(a.starts_at).getTime(), end: new Date(a.ends_at).getTime() }));
  const hours: Hour[] = sched.hours;
  const hm = (ms: number) => new Date(ms - 3 * 3600000).toISOString().slice(11, 16);
  const localInput = (ms: number) => new Date(ms - 3 * 3600000).toISOString().slice(0, 16);
  const procList = (procs.data || []).map((p) => ({ ...p, price: p.price === null ? null : Number(p.price) }));
  const presetStart = sp.inicio && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(sp.inicio) ? sp.inicio : undefined;

  const days = Array.from({ length: 7 }, (_, i) => {
    const d0 = new Date(start.getTime() + i * 86400000);
    const d1 = new Date(d0.getTime() + 86400000);
    const label = new Date(d0.getTime() + 12 * 3600000);
    return {
      key: i, title: `${DOW[label.getUTCDay()]} ${String(label.getUTCDate()).padStart(2, '0')}/${String(label.getUTCMonth() + 1).padStart(2, '0')}`,
      items: (appts.data || []).filter((a) => new Date(a.starts_at) >= d0 && new Date(a.starts_at) < d1),
      gaps: hours.length ? freeGaps({ hours, busy, from: Math.max(d0.getTime(), Date.now()), to: d1.getTime(), capacity: sched.capacity, minMin: sched.slotMin }) : [],
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
      {writable && <div className="mb-6"><NewAppointment key={presetStart || 'novo'} pros={pros.data || []} procs={procList} preset={preset.data} presetStart={presetStart} defaultMin={sched.slotMin} /></div>}
      {!hours.length && writable && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Cadastre o horário de atendimento em <Link className="underline" href="/app/configuracoes#horarios">Clínica e equipe</Link> para os horários livres aparecerem aqui e serem oferecidos pelo WhatsApp.</p>
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
        {days.map((d) => (
          <section key={d.key} className="rounded-xl bg-white p-3 shadow-sm" aria-label={d.title}>
            <h2 className="mb-2 text-sm font-semibold">{d.title}</h2>
            <ul className="space-y-2">
              {[...d.items.map((a) => ({ t: new Date(a.starts_at).getTime(), a, g: null })), ...d.gaps.map((g) => ({ t: g.start, a: null, g }))]
                .sort((x, y) => x.t - y.t)
                .map(({ a, g }) => a ? (
                <li key={a.id} className="rounded-lg border border-slate-200 p-2 text-xs">
                  <p className="font-semibold">{fmtTime(a.starts_at)}–{fmtTime(a.ends_at)} · {a.contact_id ? <Link className="underline" href={`/app/contatos/${a.contact_id}`}>{name(a.contact)}</Link> : <span className="text-violet-700">Horário livre</span>}</p>
                  <p className="text-slate-600">{[name(a.procedure) || a.procedure_text, name(a.professional), Number(a.price) > 0 ? money(Number(a.price)) : ''].filter(Boolean).join(' · ')}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <Badge tone={TONE[a.status as keyof typeof TONE]}>{a.status}</Badge>
                    {writable && a.contact_id && a.status !== 'realizado' && (
                      <>
                        {(['confirmado', 'faltou', 'cancelado'] as const).filter((s) => s !== a.status).map((s) => <StatusBtn key={s} id={a.id} status={s}>{s}</StatusBtn>)}
                        {Number(a.price) > 0 ? (
                          <>
                            <StatusBtn id={a.id} status="realizado" pay="pago" tone="green">Realizado · Já pago</StatusBtn>
                            <StatusBtn id={a.id} status="realizado" pay="balcao" tone="amber">Realizado · Vai pagar no balcão</StatusBtn>
                          </>
                        ) : <StatusBtn id={a.id} status="realizado">realizado</StatusBtn>}
                      </>
                    )}
                  </div>
                  {a.status === 'realizado' && (() => {
                    const c = chargeOf.get(a.id);
                    if (!c) return Number(a.price) > 0 ? null : <p className="mt-1 text-slate-500">Sem valor: não gerou cobrança.</p>;
                    const balcao = (c.meta as { forma?: string } | null)?.forma === 'balcao';
                    return c.status === 'pago'
                      ? <p className="mt-1 font-medium text-emerald-700">Pago · {money(Number(c.amount))}</p>
                      : (
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          <span className="font-medium text-amber-700">A receber{balcao ? ' no balcão' : ''} · {money(Number(c.amount))}</span>
                          {writable && <form action={markChargePaid}><input type="hidden" name="id" value={c.id} /><button className="rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-emerald-800 hover:bg-emerald-100" type="submit">Recebido</button></form>}
                        </div>
                      );
                  })()}
                  {writable && a.status === 'realizado' && <div className="mt-1"><StatusBtn id={a.id} status="confirmado" subtle>Desfazer realizado</StatusBtn></div>}
                </li>
              ) : g && (
                <li key={'g' + g.start}>
                  {writable
                    ? <Link href={`/app/agenda?semana=${monday}&inicio=${localInput(g.start)}`} className="block rounded-lg border border-dashed border-violet-300 bg-violet-50 p-2 text-xs text-violet-800 hover:bg-violet-100">Livre {hm(g.start)}–{hm(g.end)}</Link>
                    : <span className="block rounded-lg border border-dashed border-violet-300 bg-violet-50 p-2 text-xs text-violet-800">Livre {hm(g.start)}–{hm(g.end)}</span>}
                </li>
              ))}
              {!d.items.length && !d.gaps.length && <li className="text-xs text-slate-400">{hours.length ? 'Sem horário' : 'Livre'}</li>}
            </ul>
          </section>
        ))}
      </div>
      <section className="card mt-6 space-y-3" aria-labelledby="espera">
        <h2 id="espera" className="font-semibold">Lista de espera</h2>
        <p className="text-sm text-slate-600">Com a automação de lista de espera ativa, quando uma consulta é cancelada o horário é oferecido a esses pacientes pelo WhatsApp, na ordem de chegada.</p>
        {writable && <AddWaitlist procs={procs.data || []} />}
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

function StatusBtn({ id, status, pay, tone, subtle, children }: { id: string; status: string; pay?: 'pago' | 'balcao'; tone?: 'green' | 'amber'; subtle?: boolean; children: React.ReactNode }) {
  const cls = subtle ? 'text-slate-500 underline hover:text-slate-800'
    : tone === 'green' ? 'rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-emerald-800 hover:bg-emerald-100'
    : tone === 'amber' ? 'rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-amber-900 hover:bg-amber-100'
    : 'rounded border border-slate-200 px-1.5 py-0.5 hover:bg-slate-50';
  return (
    <form action={setAppointmentStatus}>
      <input type="hidden" name="id" value={id} /><input type="hidden" name="status" value={status} />
      {pay && <input type="hidden" name="pagamento" value={pay} />}
      <button className={cls} type="submit">{children}</button>
    </form>
  );
}
