import Link from 'next/link';
import { getContext } from '@/lib/clinic';
import { PageHeader, Badge } from '@/components/bits';
import { PayForm } from '@/components/pay-form';
import { fmtDate, fmtTime, money, waLink } from '@/lib/utils';
import { methodLabel } from '@/lib/payments';
import { renderReminder } from '@/lib/reminder';
import { gapsFor, loadSchedule } from '@/lib/schedule';
import { openWindows, toMin } from '@/lib/slots';
import { NewAppointment, type PlanItem } from './new-appt';
import { markChargePaid, setAppointmentStatus, setWaitlistStatus } from './actions';
import { AddWaitlist } from './waitlist';
import { ReminderButton } from './reminder';

export const metadata = { title: 'Agenda' };
const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const TONE = { livre: 'violet', agendado: 'slate', confirmado: 'green', remarcar: 'amber', realizado: 'blue', faltou: 'red', cancelado: 'amber' } as const;
const BLOCK: Record<string, string> = {
  agendado: 'border-slate-300 bg-white', confirmado: 'border-emerald-400 bg-emerald-50', remarcar: 'border-amber-400 bg-amber-50',
  realizado: 'border-sky-400 bg-sky-50', faltou: 'border-red-300 bg-red-50 opacity-70', cancelado: 'border-slate-200 bg-slate-50 opacity-50 line-through', livre: 'border-violet-300 bg-violet-50',
};
const HR = 3600000, DAY = 86400000;
const UUID = /^[0-9a-f-]{36}$/;

function mondayOf(dateStr?: string) {
  const base = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? new Date(dateStr + 'T12:00:00-03:00') : new Date();
  const local = new Date(base.getTime() - 3 * HR);
  local.setUTCDate(local.getUTCDate() - ((local.getUTCDay() + 6) % 7));
  return local.toISOString().slice(0, 10);
}
const nm = (x: unknown) => (x as { name: string } | null)?.name || '';

type Sp = { semana?: string; contato?: string; inicio?: string; prof?: string; modo?: string; dia?: string; item?: string };

export default async function AgendaPage({ searchParams }: { searchParams: Promise<Sp> }) {
  const { supabase, clinic, writable } = await getContext();
  const sp = await searchParams;
  const monday = mondayOf(sp.semana);
  const start = new Date(monday + 'T00:00:00-03:00');
  const end = new Date(start.getTime() + 7 * DAY);
  const shift = (d: number) => new Date(start.getTime() + d * DAY + 12 * HR).toISOString().slice(0, 10);
  const modo = sp.modo === 'lista' ? 'lista' : 'grade';
  const prof = sp.prof && UUID.test(sp.prof) ? sp.prof : '';
  const qs = (o: Partial<Sp>) => {
    const m = { semana: monday, modo, prof, ...o };
    return '/app/agenda?' + new URLSearchParams(Object.entries(m).filter(([, v]) => v) as [string, string][]).toString();
  };

  const tomorrow0 = new Date(new Date(Date.now() - 3 * HR).toISOString().slice(0, 10) + 'T00:00:00-03:00').getTime() + DAY;
  const [appts, preset, pros, procs, wait, sched, remind, planItem] = await Promise.all([
    supabase.from('appointments').select('id, starts_at, ends_at, status, contact_id, professional_id, procedure_text, price, quote_item_id, contact:contacts(name), professional:professionals(name), procedure:procedures(name)')
      .eq('clinic_id', clinic.id).gte('starts_at', start.toISOString()).lt('starts_at', end.toISOString()).order('starts_at'),
    sp.contato && UUID.test(sp.contato) ? supabase.from('contacts').select('id, name').eq('clinic_id', clinic.id).eq('id', sp.contato).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('professionals').select('id, name').eq('clinic_id', clinic.id).eq('active', true).eq('attends', true).order('name'),
    supabase.from('procedures').select('id, name, duration_min, price').eq('clinic_id', clinic.id).eq('active', true).order('name'),
    supabase.from('waitlist').select('id, status, created_at, contact_id, contact:contacts(name), procedure:procedures(name), procedure_text').eq('clinic_id', clinic.id).in('status', ['aguardando', 'ofertado']).order('created_at'),
    loadSchedule(supabase, clinic.id),
    supabase.from('appointments').select('id, starts_at, status, meta, procedure_text, professional_id, contact:contacts(name, phone, consent_whatsapp), procedure:procedures(name), professional:professionals(name)')
      .eq('clinic_id', clinic.id).in('status', ['agendado', 'remarcar']).gte('starts_at', new Date(tomorrow0).toISOString()).lt('starts_at', new Date(tomorrow0 + DAY).toISOString()).order('starts_at'),
    sp.item && UUID.test(sp.item) ? supabase.from('quote_items').select('id, description, qty, procedure:procedures(name, duration_min), quote:quotes!inner(status, contact_id)').eq('clinic_id', clinic.id).eq('id', sp.item).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  // sessão de plano de tratamento a agendar (vem da ficha do paciente)
  let plan: PlanItem | null = null;
  if (planItem.data && (planItem.data.quote as unknown as { status: string }).status === 'aprovado') {
    const { count } = await supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('quote_item_id', planItem.data.id).not('status', 'in', '(cancelado,faltou)');
    const pr = planItem.data.procedure as unknown as { name: string; duration_min: number } | null;
    plan = { id: planItem.data.id, description: planItem.data.description, procName: pr?.name || null, duration: pr?.duration_min || sched.slotMin, done: count || 0, qty: planItem.data.qty };
  }

  const all = appts.data || [];
  const shown = prof ? all.filter((a) => a.professional_id === prof) : all;
  const ids = shown.filter((a) => a.status === 'realizado').map((a) => a.id);
  const { data: chs } = ids.length ? await supabase.from('charges').select('id, appointment_id, status, amount, meta, payment_method, installments').in('appointment_id', ids).neq('status', 'cancelado') : { data: [] };
  const chargeOf = new Map((chs || []).map((c) => [c.appointment_id as string, c]));
  const busy = all.filter((a) => !['cancelado', 'livre'].includes(a.status)).map((a) => ({ start: new Date(a.starts_at).getTime(), end: new Date(a.ends_at).getTime(), pro: a.professional_id }));
  const hm = (ms: number) => new Date(ms - 3 * HR).toISOString().slice(11, 16);
  const localInput = (ms: number) => new Date(ms - 3 * HR).toISOString().slice(0, 16);
  const procList = (procs.data || []).map((p) => ({ ...p, price: p.price === null ? null : Number(p.price) }));
  const presetStart = sp.inicio && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(sp.inicio) ? sp.inicio : undefined;

  const days = Array.from({ length: 7 }, (_, i) => {
    const d0 = start.getTime() + i * DAY, d1 = d0 + DAY;
    const label = new Date(d0 + 12 * HR);
    return {
      key: i, iso: label.toISOString().slice(0, 10), d0,
      title: `${DOW[label.getUTCDay()]} ${String(label.getUTCDate()).padStart(2, '0')}/${String(label.getUTCMonth() + 1).padStart(2, '0')}`,
      items: shown.filter((a) => { const t = new Date(a.starts_at).getTime(); return t >= d0 && t < d1; }),
      gaps: gapsFor(sched, busy, Math.max(d0, Date.now()), d1, prof || null),
    };
  });

  // faixa de horas da grade: do primeiro intervalo de atendimento ao último (ou 07–20)
  const proHours = prof ? sched.pros.find((p) => p.id === prof)?.hours || sched.hours : [...sched.hours, ...sched.pros.flatMap((p) => p.hours)];
  const wins = openWindows(proHours, start.getTime(), end.getTime());
  let h0 = 7 * 60, h1 = 20 * 60;
  if (wins.length || shown.length) {
    const mins = [...proHours.map((h) => toMin(h.start_time)), ...shown.map((a) => (new Date(a.starts_at).getTime() - 3 * HR) % DAY / 60000)];
    const maxs = [...proHours.map((h) => toMin(h.end_time)), ...shown.map((a) => Math.min(24 * 60, ((new Date(a.ends_at).getTime() - 3 * HR) % DAY) / 60000 || 24 * 60))];
    h0 = Math.max(0, Math.floor(Math.min(...mins) / 60) * 60);
    h1 = Math.min(24 * 60, Math.ceil(Math.max(...maxs) / 60) * 60);
    if (h1 - h0 < 4 * 60) h1 = Math.min(24 * 60, h0 + 4 * 60);
  }
  const PX = 1.1; // px por minuto
  const top = (ms: number, d0: number) => ((ms - d0) / 60000 - h0) * PX;
  const dia = sp.dia && /^\d{4}-\d{2}-\d{2}$/.test(sp.dia) ? sp.dia : null;
  const detail = dia ? days.find((d) => d.iso === dia) : null;

  const reminders = (remind.data || []).filter((a) => (!prof || a.professional_id === prof) && (a.contact as unknown as { phone: string | null } | null)?.phone);

  const Card = ({ a }: { a: (typeof all)[number] }) => (
    <li id={`a-${a.id}`} className="scroll-mt-24 rounded-lg border border-slate-200 bg-white p-2 text-xs">
      <p className="font-semibold">{fmtTime(a.starts_at)}–{fmtTime(a.ends_at)} · {a.contact_id ? <Link className="underline" href={`/app/contatos/${a.contact_id}`}>{nm(a.contact)}</Link> : <span className="text-violet-700">Horário livre</span>}</p>
      <p className="text-slate-600">{[nm(a.procedure) || a.procedure_text, nm(a.professional), Number(a.price) > 0 ? money(Number(a.price)) : '', a.quote_item_id ? 'sessão do plano' : ''].filter(Boolean).join(' · ')}</p>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        <Badge tone={TONE[a.status as keyof typeof TONE]}>{a.status}</Badge>
        {writable && a.contact_id && a.status !== 'realizado' && (
          <>
            {(['confirmado', 'faltou', 'cancelado'] as const).filter((s) => s !== a.status).map((s) => <StatusBtn key={s} id={a.id} status={s}>{s}</StatusBtn>)}
            {Number(a.price) > 0 ? (
              <>
                <PayForm action={setAppointmentStatus} hidden={{ id: a.id, status: 'realizado', pagamento: 'pago' }} label="Realizado · Já pago" />
                <StatusBtn id={a.id} status="realizado" pay="balcao" tone="amber">Realizado · Vai pagar no balcão</StatusBtn>
              </>
            ) : <StatusBtn id={a.id} status="realizado">realizado</StatusBtn>}
          </>
        )}
      </div>
      {a.status === 'realizado' && (() => {
        const c = chargeOf.get(a.id);
        if (!c) return a.quote_item_id ? <p className="mt-1 text-slate-500">Sessão do plano: já cobrada no orçamento.</p> : Number(a.price) > 0 ? null : <p className="mt-1 text-slate-500">Sem valor: não gerou cobrança.</p>;
        const balcao = (c.meta as { forma?: string } | null)?.forma === 'balcao';
        return c.status === 'pago'
          ? <p className="mt-1 font-medium text-emerald-700">Pago · {money(Number(c.amount))}{c.payment_method ? ` · ${methodLabel(c.payment_method)}${c.payment_method === 'credito' && c.installments > 1 ? ` ${c.installments}x` : ''}` : ''}</p>
          : (
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <span className="font-medium text-amber-700">A receber{balcao ? ' no balcão' : ''} · {money(Number(c.amount))}</span>
              {writable && <PayForm action={markChargePaid} hidden={{ id: c.id }} label="Recebido" />}
            </div>
          );
      })()}
      {writable && a.status === 'realizado' && <div className="mt-1"><StatusBtn id={a.id} status="confirmado" subtle>Desfazer realizado</StatusBtn></div>}
    </li>
  );

  return (
    <>
      <PageHeader title="Agenda" desc="Confirme, marque falta ou realizado: isso alimenta o financeiro, o painel e as automações.">
        <Link className="btn btn-sec" href={qs({ semana: shift(-7), dia: '' })}>‹ Semana anterior</Link>
        <Link className="btn btn-sec" href={qs({ semana: mondayOf(), dia: '' })}>Hoje</Link>
        <Link className="btn btn-sec" href={qs({ semana: shift(7), dia: '' })}>Próxima ›</Link>
      </PageHeader>

      {writable && <div className="mb-6"><NewAppointment key={(presetStart || 'novo') + (plan?.id || '')} pros={pros.data || []} procs={procList} preset={preset.data} presetStart={presetStart} presetPro={prof || undefined} defaultMin={sched.slotMin} plan={plan} /></div>}
      {!sched.hasHours && writable && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Cadastre o horário de atendimento em <Link className="underline" href="/app/configuracoes#horarios">Clínica e equipe</Link> para os horários livres aparecerem aqui e serem oferecidos pelo WhatsApp.</p>
      )}

      {reminders.length > 0 && writable && (
        <section className="card mb-6 space-y-2" aria-labelledby="lembretes">
          <h2 id="lembretes" className="font-semibold">Lembretes de amanhã ({reminders.length})</h2>
          <p className="text-sm text-slate-600">Um toque abre o WhatsApp com a mensagem pronta. Depois que o paciente responder, marque como confirmado. Com as automações, isso sai sozinho.</p>
          <ul className="divide-y divide-slate-100 text-sm">
            {reminders.map((a) => {
              const c = a.contact as unknown as { name: string; phone: string; consent_whatsapp: boolean };
              const msg = renderReminder(clinic.reminder_template, { nome: c.name, clinica: clinic.name, startsAt: a.starts_at, procedimento: nm(a.procedure) || a.procedure_text, profissional: nm(a.professional) });
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="font-medium">{fmtTime(a.starts_at)} · {c.name}</span>
                  <span className="text-slate-500">{nm(a.procedure) || a.procedure_text}</span>
                  {c.consent_whatsapp ? <ReminderButton id={a.id} href={waLink(c.phone, msg)} sent={!!(a.meta as { lembrete_manual_em?: string } | null)?.lembrete_manual_em} /> : <Badge tone="amber">pediu para não receber mensagens</Badge>}
                  <StatusBtn id={a.id} status="confirmado">confirmou</StatusBtn>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm" role="group" aria-label="Modo de visualização">
          <Link href={qs({ modo: 'grade' })} aria-current={modo === 'grade' ? 'page' : undefined} className={`rounded-md px-3 py-1 ${modo === 'grade' ? 'bg-ink text-white' : ''}`}>Grade</Link>
          <Link href={qs({ modo: 'lista' })} aria-current={modo === 'lista' ? 'page' : undefined} className={`rounded-md px-3 py-1 ${modo === 'lista' ? 'bg-ink text-white' : ''}`}>Lista</Link>
        </div>
        {(pros.data || []).length > 0 && (
          <nav aria-label="Filtrar por profissional" className="flex flex-wrap gap-1 text-sm">
            <Link href={qs({ prof: '' })} className={`rounded-full border px-3 py-1 ${!prof ? 'border-ink bg-ink text-white' : 'border-slate-200 bg-white'}`}>Todos</Link>
            {(pros.data || []).map((p) => <Link key={p.id} href={qs({ prof: p.id })} className={`rounded-full border px-3 py-1 ${prof === p.id ? 'border-ink bg-ink text-white' : 'border-slate-200 bg-white'}`}>{p.name}</Link>)}
          </nav>
        )}
      </div>

      {modo === 'grade' ? (
        <>
          <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
            <div className="grid min-w-[900px]" style={{ gridTemplateColumns: '52px repeat(7, minmax(0, 1fr))' }}>
              <div />
              {days.map((d) => (
                <Link key={d.key} href={qs({ dia: d.iso }) + '#dia'} className={`border-b border-l border-slate-100 px-2 py-2 text-center text-sm font-semibold hover:bg-slate-50 ${d.iso === dia ? 'bg-slate-100' : ''}`}>{d.title}</Link>
              ))}
              <div className="relative" style={{ height: (h1 - h0) * PX }}>
                {Array.from({ length: (h1 - h0) / 60 + 1 }, (_, i) => (
                  <span key={i} className="absolute right-1 -translate-y-1/2 text-[11px] text-slate-400" style={{ top: i * 60 * PX }}>{String((h0 + i * 60) / 60).padStart(2, '0')}:00</span>
                ))}
              </div>
              {days.map((d) => {
                // colunas lado a lado quando há consultas ao mesmo tempo
                const evs = d.items.map((a) => ({ a, s: new Date(a.starts_at).getTime(), e: new Date(a.ends_at).getTime(), lane: 0, lanes: 1 })).sort((x, y) => x.s - y.s || y.e - x.e);
                const ends: number[] = [];
                let group: typeof evs = [];
                const flush = () => { const n = Math.max(1, ...group.map((g) => g.lane + 1)); group.forEach((g) => { g.lanes = n; }); group = []; };
                for (const ev of evs) {
                  if (group.length && ev.s >= Math.max(...group.map((g) => g.e))) { flush(); ends.length = 0; }
                  let lane = ends.findIndex((t) => t <= ev.s);
                  if (lane < 0) { lane = ends.length; ends.push(ev.e); } else ends[lane] = ev.e;
                  ev.lane = lane; group.push(ev);
                }
                flush();
                return (
                  <div key={d.key} className="relative border-l border-slate-100" style={{ height: (h1 - h0) * PX }} aria-label={`Agenda de ${d.title}`}>
                    {Array.from({ length: (h1 - h0) / 60 }, (_, i) => <div key={i} className="absolute inset-x-0 border-t border-slate-100" style={{ top: i * 60 * PX }} aria-hidden="true" />)}
                    {d.gaps.flatMap((g) => {
                      // na grade, o livre aparece só onde não há consulta desenhada (filtre por profissional para ver o livre de cada um)
                      let parts = [{ start: g.start, end: g.end }];
                      for (const ev of evs) if (!['cancelado', 'livre'].includes(ev.a.status)) parts = parts.flatMap((x) => (ev.s < x.end && ev.e > x.start ? [{ start: x.start, end: ev.s }, { start: ev.e, end: x.end }] : [x]).filter((y) => y.end - y.start >= 15 * 60000));
                      return parts;
                    }).map((g) => {
                      const t = top(g.start, d.d0), h = (g.end - g.start) / 60000 * PX;
                      if (t + h <= 0 || t >= (h1 - h0) * PX) return null;
                      const cls = 'absolute inset-x-1 block rounded border border-dashed border-violet-300 bg-violet-50/70 px-1 text-[11px] text-violet-800';
                      return writable
                        ? <Link key={'g' + g.start} href={qs({ inicio: localInput(g.start) })} className={cls + ' hover:bg-violet-100'} style={{ top: Math.max(0, t), height: Math.max(14, h) }} title={`Livre ${hm(g.start)}–${hm(g.end)}`}>Livre {hm(g.start)}</Link>
                        : <span key={'g' + g.start} className={cls} style={{ top: Math.max(0, t), height: Math.max(14, h) }}>Livre {hm(g.start)}</span>;
                    })}
                    {evs.map(({ a, s, e, lane, lanes }) => (
                      <Link key={a.id} href={qs({ dia: d.iso }) + `#a-${a.id}`}
                        className={`absolute overflow-hidden rounded border-l-4 px-1 py-0.5 text-[11px] leading-tight shadow-sm hover:z-10 hover:shadow ${BLOCK[a.status] || BLOCK.agendado}`}
                        style={{ top: top(s, d.d0), height: Math.max(18, (e - s) / 60000 * PX - 1), left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)` }}
                        title={`${fmtTime(a.starts_at)}–${fmtTime(a.ends_at)} ${nm(a.contact) || 'Horário livre'} · ${nm(a.procedure) || a.procedure_text || ''} · ${a.status}`}>
                        <b>{fmtTime(a.starts_at)}</b> {nm(a.contact) || 'Livre'}
                        <span className="block truncate text-slate-600">{[nm(a.procedure) || a.procedure_text, !prof && nm(a.professional)].filter(Boolean).join(' · ')}</span>
                      </Link>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">Toque numa consulta ou no dia para ver os botões (confirmar, realizado, pagamento). Toque num horário livre para agendar nele.</p>
          {detail && (
            <section id="dia" className="mt-6 scroll-mt-24" aria-labelledby="dia-t">
              <h2 id="dia-t" className="mb-2 font-semibold">{detail.title}</h2>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {detail.items.map((a) => <Card key={a.id} a={a} />)}
                {!detail.items.length && <li className="text-sm text-slate-500">Nenhuma consulta neste dia.</li>}
              </ul>
            </section>
          )}
        </>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          {days.map((d) => (
            <section key={d.key} className="rounded-xl bg-white p-3 shadow-sm" aria-label={d.title}>
              <h2 className="mb-2 text-sm font-semibold">{d.title}</h2>
              <ul className="space-y-2">
                {[...d.items.map((a) => ({ t: new Date(a.starts_at).getTime(), a, g: null })), ...d.gaps.map((g) => ({ t: g.start, a: null, g }))]
                  .sort((x, y) => x.t - y.t)
                  .map(({ a, g }) => a ? <Card key={a.id} a={a} /> : g && (
                    <li key={'g' + g.start}>
                      {writable
                        ? <Link href={qs({ inicio: localInput(g.start) })} className="block rounded-lg border border-dashed border-violet-300 bg-violet-50 p-2 text-xs text-violet-800 hover:bg-violet-100">Livre {hm(g.start)}–{hm(g.end)}</Link>
                        : <span className="block rounded-lg border border-dashed border-violet-300 bg-violet-50 p-2 text-xs text-violet-800">Livre {hm(g.start)}–{hm(g.end)}</span>}
                    </li>
                  ))}
                {!d.items.length && !d.gaps.length && <li className="text-xs text-slate-400">{sched.hasHours ? 'Sem horário' : 'Livre'}</li>}
              </ul>
            </section>
          ))}
        </div>
      )}

      <section className="card mt-6 space-y-3" aria-labelledby="espera">
        <h2 id="espera" className="font-semibold">Lista de espera</h2>
        <p className="text-sm text-slate-600">{clinic.waitlist_webhook_url
          ? 'Quando uma consulta futura é cancelada (aqui ou pelo paciente), o horário é oferecido a esses pacientes pelo WhatsApp, na ordem de chegada.'
          : <>Com a automação de lista de espera ligada (endereço em <Link className="underline" href="/app/configuracoes#automacoes">Clínica e equipe</Link>), quando uma consulta é cancelada o horário é oferecido a esses pacientes pelo WhatsApp.</>}</p>
        {writable && <AddWaitlist procs={procs.data || []} />}
        <ul className="divide-y divide-slate-100 text-sm">
          {(wait.data || []).map((w) => (
            <li key={w.id} className="flex flex-wrap items-center gap-2 py-2">
              <Link className="font-medium underline" href={`/app/contatos/${w.contact_id}`}>{nm(w.contact)}</Link>
              <span className="text-slate-500">{nm(w.procedure) || w.procedure_text || 'qualquer procedimento'} · desde {fmtDate(w.created_at)}</span>
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
