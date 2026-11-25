import Link from 'next/link';
import { getContext } from '@/lib/clinic';
import { PageHeader, Stat, Empty, Badge } from '@/components/bits';
import { fmtDateTime, fmtTime, money } from '@/lib/utils';

export const metadata = { title: 'Painel' };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ bemvindo?: string }> }) {
  const { supabase, clinic } = await getContext();
  const sp = await searchParams;
  const now = new Date();
  // limites do dia e do mês no horário de Brasília (UTC-3)
  const br = new Date(now.getTime() - 3 * 3600000);
  const monthStart = new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), 1, 3)).toISOString();
  const dayStart = new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), br.getUTCDate(), 3)).toISOString();
  const today = br.toISOString().slice(0, 10);
  const dayEnd = new Date(new Date(dayStart).getTime() + 86400000).toISOString();
  const d30 = new Date(Date.now() - 30 * 86400000).toISOString();

  const [leads, stages, openDeals, wonMonth, todayAppts, past30, tasks, paidMonth, openCharges] = await Promise.all([
    supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('clinic_id', clinic.id).gte('created_at', monthStart),
    supabase.from('stages').select('id, kind').eq('clinic_id', clinic.id),
    supabase.from('deals').select('value, stage_id').eq('clinic_id', clinic.id).is('closed_at', null),
    supabase.from('deals').select('value, stage:stages!inner(kind)').eq('clinic_id', clinic.id).gte('closed_at', monthStart).eq('stage.kind', 'won'),
    supabase.from('appointments').select('id, starts_at, status, procedure_text, contact:contacts(name), procedure:procedures(name)').eq('clinic_id', clinic.id).gte('starts_at', dayStart).lt('starts_at', dayEnd).order('starts_at'),
    supabase.from('appointments').select('status').eq('clinic_id', clinic.id).gte('starts_at', d30).lt('starts_at', now.toISOString()),
    supabase.from('activities').select('id, body, due_at, contact_id, contact:contacts(name)').eq('clinic_id', clinic.id).eq('type', 'tarefa').is('done_at', null).order('due_at').limit(8),
    supabase.from('charges').select('amount').eq('clinic_id', clinic.id).eq('status', 'pago').gte('paid_at', monthStart).limit(10000),
    supabase.from('charges').select('amount, due_date').eq('clinic_id', clinic.id).eq('status', 'aberto').limit(10000),
  ]);
  const sumAmt = (l: { amount: number }[] | null) => (l || []).reduce((a, c) => a + Number(c.amount || 0), 0);
  const faturado = sumAmt(paidMonth.data);
  const aReceber = sumAmt(openCharges.data);
  const vencido = sumAmt((openCharges.data || []).filter((c) => c.due_date < today));

  const openIds = new Set((stages.data || []).filter((s) => s.kind === 'open').map((s) => s.id));
  const pipeline = (openDeals.data || []).filter((d) => openIds.has(d.stage_id)).reduce((a, d) => a + Number(d.value || 0), 0);
  const won = (wonMonth.data || []).reduce((a, d) => a + Number(d.value || 0), 0);
  const p = past30.data || [];
  const done = p.filter((a) => a.status === 'realizado' || a.status === 'faltou');
  const faltas = done.length ? Math.round((p.filter((a) => a.status === 'faltou').length / done.length) * 100) : null;

  return (
    <>
      <PageHeader title={`Olá! Esta é a ${clinic.name}`} desc="O resumo do mês: leads, funil, agenda e tarefas.">
        <Link href="/app/contatos?novo=1" className="btn btn-pri">Novo lead</Link>
        <Link href="/app/criativos/novo" className="btn btn-lima">Criar anúncio com IA</Link>
      </PageHeader>
      {sp.bemvindo && (
        <div className="card mb-6 border-lima">
          <p className="font-semibold">Sua clínica está pronta. Próximos passos:</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-700">
            <li><Link className="underline" href="/app/configuracoes">Complete os dados, o logo e as cores da clínica</Link> (eles entram nos criativos).</li>
            <li><Link className="underline" href="/app/configuracoes#profissionais">Cadastre os profissionais com foto</Link>.</li>
            <li><Link className="underline" href="/app/criativos/novo">Crie seus primeiros anúncios</Link>.</li>
          </ol>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat label="Faturado no mês" value={money(faturado)} hint="Cobranças pagas neste mês" />
        <Link href="/app/financeiro" className="block rounded-xl focus-visible:outline-2"><Stat label="A receber" value={money(aReceber)} hint={vencido > 0 ? `${money(vencido)} vencido` : 'Nada vencido'} /></Link>
        <Stat label="Leads no mês" value={leads.count ?? 0} />
        <Stat label="Em negociação" value={money(pipeline)} hint="Soma das oportunidades abertas" />
        <Stat label="Fechado no mês (CRM)" value={money(won)} hint="Oportunidades ganhas" />
        <Stat label="Faltas (30 dias)" value={faltas === null ? '—' : `${faltas}%`} hint="Faltou ÷ (realizado + faltou)" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card" aria-labelledby="hoje">
          <h2 id="hoje" className="mb-3 font-semibold">Agenda de hoje</h2>
          {todayAppts.data?.length ? (
            <ul className="divide-y divide-slate-100">
              {todayAppts.data.map((a) => (
                <li key={a.id} className="flex items-center justify-between py-2 text-sm">
                  <span><b>{fmtTime(a.starts_at)}</b> · {(a.contact as unknown as { name: string } | null)?.name || 'Horário livre'} <span className="text-slate-500">{(a.procedure as unknown as { name: string } | null)?.name || a.procedure_text}</span></span>
                  <Badge tone={a.status === 'confirmado' ? 'green' : a.status === 'faltou' ? 'red' : 'slate'}>{a.status}</Badge>
                </li>
              ))}
            </ul>
          ) : <Empty title="Nenhuma consulta hoje"><Link className="underline" href="/app/agenda">Abrir agenda</Link></Empty>}
        </section>
        <section className="card" aria-labelledby="tarefas">
          <h2 id="tarefas" className="mb-3 font-semibold">Tarefas pendentes</h2>
          {tasks.data?.length ? (
            <ul className="divide-y divide-slate-100">
              {tasks.data.map((t) => (
                <li key={t.id} className="py-2 text-sm">
                  <Link className="font-medium underline" href={`/app/contatos/${t.contact_id}`}>{(t.contact as unknown as { name: string } | null)?.name || 'Contato'}</Link>: {t.body}
                  {t.due_at && <span className={`ml-2 text-xs ${new Date(t.due_at) < now ? 'text-red-600' : 'text-slate-500'}`}>{fmtDateTime(t.due_at)}</span>}
                </li>
              ))}
            </ul>
          ) : <Empty title="Nenhuma tarefa pendente" />}
        </section>
      </div>
    </>
  );
}
