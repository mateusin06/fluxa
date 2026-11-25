import Link from 'next/link';
import { getContext } from '@/lib/clinic';
import { PageHeader, Badge, Stat, Empty } from '@/components/bits';
import { PayForm } from '@/components/pay-form';
import { fmtDate, money } from '@/lib/utils';
import { categoryLabel, EXPENSE_CATEGORIES, METHODS, methodLabel, monthBounds } from '@/lib/payments';
import { monthCommissions } from '@/lib/commission';
import { ChargeForm, ExpenseForm } from './form';
import { commissionToExpense, setChargeStatus, setExpenseStatus } from './actions';

export const metadata = { title: 'Financeiro' };
type Aba = 'receber' | 'pagas' | 'despesas' | 'resultado' | 'comissoes';
const sum = (a: { amount: number | string }[] | null | undefined) => (a || []).reduce((x, c) => x + Number(c.amount), 0);
const nm = (x: unknown) => (x as { name: string } | null)?.name || '';

export default async function Page({ searchParams }: { searchParams: Promise<{ aba?: string; st?: string; mes?: string }> }) {
  const { supabase, clinic, writable, isAdmin } = await getContext();
  const sp = await searchParams;
  const abas: [Aba, string][] = [['receber', 'A receber'], ['pagas', 'Recebidas'], ...(isAdmin ? [['despesas', 'Despesas'], ['resultado', 'Resultado do mês'], ['comissoes', 'Comissões']] as [Aba, string][] : [])];
  const aba: Aba = (abas.find(([k]) => k === sp.aba)?.[0]) || (sp.st === 'pago' ? 'pagas' : 'receber');
  const M = monthBounds(sp.mes);
  const today = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
  const link = (o: { aba?: string; mes?: string }) => `/app/financeiro?aba=${o.aba || aba}&mes=${o.mes || M.ym}`;
  const monthNav = (
    <div className="mb-4 flex items-center gap-2 text-sm">
      <Link className="btn btn-sec min-h-8 px-2 py-1" href={link({ mes: M.prev })} aria-label="Mês anterior">‹</Link>
      <span className="min-w-36 text-center font-semibold">{M.label}</span>
      <Link className="btn btn-sec min-h-8 px-2 py-1" href={link({ mes: M.next })} aria-label="Próximo mês">›</Link>
    </div>
  );

  const { data: open } = await supabase.from('charges').select('amount, due_date').eq('clinic_id', clinic.id).eq('status', 'aberto').limit(10000);
  const late = (open || []).filter((c) => c.due_date < today);

  let body: React.ReactNode = null;

  if (aba === 'receber') {
    const { data: list } = await supabase.from('charges').select('id, description, amount, due_date, status, payment_link, meta, contact_id, contact:contacts(name)').eq('clinic_id', clinic.id).eq('status', 'aberto').order('due_date').limit(500);
    body = (
      <>
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
          <Stat label="Em aberto" value={money(sum(open))} />
          <Stat label="Vencido" value={money(sum(late))} hint={`${late.length} cobrança(s)`} />
        </div>
        {writable && <div className="mb-6"><ChargeForm /></div>}
        {list?.length ? (
          <div className="card overflow-x-auto p-0">
            <table className="tbl">
              <thead><tr><th>Paciente</th><th>Descrição</th><th>Valor</th><th>Vencimento</th><th>Lembretes</th><th /></tr></thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id}>
                    <td><Link className="underline" href={`/app/contatos/${c.contact_id}`}>{nm(c.contact)}</Link></td>
                    <td>{c.description}{(c.meta as { forma?: string } | null)?.forma === 'balcao' && <> <Badge tone="amber">balcão</Badge></>}{c.payment_link && <> · <a className="underline" href={c.payment_link} target="_blank" rel="noreferrer">link</a></>}</td>
                    <td>{money(c.amount)}</td>
                    <td>{fmtDate(c.due_date + 'T12:00:00Z')} {c.due_date < today && <Badge tone="red">vencida</Badge>}</td>
                    <td className="text-xs text-slate-500">{(c.meta as { etapa_cobranca?: string })?.etapa_cobranca || '—'}</td>
                    <td>{writable && (
                      <span className="flex flex-wrap gap-1">
                        <PayForm action={setChargeStatus} hidden={{ id: c.id, status: 'pago' }} label="Pago" className="btn btn-sec min-h-8 px-2 py-1 text-xs" />
                        <form action={setChargeStatus}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="status" value="cancelado" /><button className="btn btn-danger min-h-8 px-2 py-1 text-xs" type="submit">Cancelar</button></form>
                      </span>
                    )}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty title="Nenhuma cobrança em aberto" />}
      </>
    );
  }

  if (aba === 'pagas') {
    const { data: list } = await supabase.from('charges').select('id, description, amount, paid_at, payment_method, installments, contact_id, contact:contacts(name)')
      .eq('clinic_id', clinic.id).eq('status', 'pago').gte('paid_at', M.start).lt('paid_at', M.end).order('paid_at', { ascending: false }).limit(2000);
    const byMethod = [...METHODS, ['', 'Sem forma informada'] as const].map(([k, l]) => ({ k, l, v: sum((list || []).filter((c) => (c.payment_method || '') === k)) })).filter((x) => x.v > 0);
    body = (
      <>
        {monthNav}
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Recebido no mês" value={money(sum(list))} hint={`${list?.length || 0} pagamento(s)`} />
          {byMethod.map((x) => <Stat key={x.k} label={x.l} value={money(x.v)} />)}
        </div>
        {list?.length ? (
          <div className="card overflow-x-auto p-0">
            <table className="tbl">
              <thead><tr><th>Data</th><th>Paciente</th><th>Descrição</th><th>Valor</th><th>Forma</th><th /></tr></thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id}>
                    <td>{fmtDate(c.paid_at)}</td>
                    <td><Link className="underline" href={`/app/contatos/${c.contact_id}`}>{nm(c.contact)}</Link></td>
                    <td>{c.description}</td>
                    <td>{money(c.amount)}</td>
                    <td>{methodLabel(c.payment_method) || '—'}{c.payment_method === 'credito' && c.installments > 1 ? ` ${c.installments}x` : ''}</td>
                    <td><a className="text-sm underline" href={`/app/financeiro/recibo/${c.id}`} target="_blank" rel="noreferrer">Recibo (PDF)</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty title="Nenhum pagamento neste mês" />}
      </>
    );
  }

  if (aba === 'despesas' && isAdmin) {
    const [{ data: list }, { data: pros }] = await Promise.all([
      supabase.from('expenses').select('id, description, category, amount, due_date, status, paid_at, payment_method, professional:professionals(name)')
        .eq('clinic_id', clinic.id).neq('status', 'cancelado').gte('due_date', M.startDate).lt('due_date', M.endDate).order('due_date').limit(2000),
      supabase.from('professionals').select('id, name').eq('clinic_id', clinic.id).eq('active', true).order('name'),
    ]);
    const aberto = (list || []).filter((e) => e.status === 'aberto');
    body = (
      <>
        {monthNav}
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
          <Stat label="Despesas do mês" value={money(sum(list))} />
          <Stat label="A pagar" value={money(sum(aberto))} hint={`${aberto.filter((e) => e.due_date < today).length} vencida(s)`} />
        </div>
        {writable && <div className="mb-6"><ExpenseForm pros={pros || []} /></div>}
        {list?.length ? (
          <div className="card overflow-x-auto p-0">
            <table className="tbl">
              <thead><tr><th>Vencimento</th><th>Descrição</th><th>Categoria</th><th>Valor</th><th>Situação</th><th /></tr></thead>
              <tbody>
                {list.map((e) => (
                  <tr key={e.id}>
                    <td>{fmtDate(e.due_date + 'T12:00:00Z')}</td>
                    <td>{e.description}{nm(e.professional) && <span className="text-slate-500"> · {nm(e.professional)}</span>}</td>
                    <td>{categoryLabel(e.category)}</td>
                    <td>{money(e.amount)}</td>
                    <td>{e.status === 'pago' ? <Badge tone="green">paga {fmtDate(e.paid_at)}{e.payment_method ? ` · ${methodLabel(e.payment_method)}` : ''}</Badge> : e.due_date < today ? <Badge tone="red">vencida</Badge> : <Badge>a pagar</Badge>}</td>
                    <td>{writable && e.status === 'aberto' && (
                      <span className="flex flex-wrap gap-1">
                        <PayForm action={setExpenseStatus} hidden={{ id: e.id, status: 'pago' }} label="Paguei" className="btn btn-sec min-h-8 px-2 py-1 text-xs" />
                        <form action={setExpenseStatus}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="status" value="cancelado" /><button className="btn btn-danger min-h-8 px-2 py-1 text-xs" type="submit">Excluir</button></form>
                      </span>
                    )}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty title="Nenhuma despesa neste mês" />}
      </>
    );
  }

  if (aba === 'resultado' && isAdmin) {
    const [{ data: rec }, { data: exPaid }, { data: exOpen }] = await Promise.all([
      supabase.from('charges').select('amount, payment_method').eq('clinic_id', clinic.id).eq('status', 'pago').gte('paid_at', M.start).lt('paid_at', M.end).limit(10000),
      supabase.from('expenses').select('amount, category').eq('clinic_id', clinic.id).eq('status', 'pago').gte('paid_at', M.start).lt('paid_at', M.end).limit(10000),
      supabase.from('expenses').select('amount').eq('clinic_id', clinic.id).eq('status', 'aberto').gte('due_date', M.startDate).lt('due_date', M.endDate).limit(10000),
    ]);
    const entradas = sum(rec), saidas = sum(exPaid), res = entradas - saidas;
    const cats = EXPENSE_CATEGORIES.map(([k, l]) => ({ l, v: sum((exPaid || []).filter((e) => e.category === k)) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
    body = (
      <>
        {monthNav}
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Entradas (recebido)" value={money(entradas)} />
          <Stat label="Saídas (despesas pagas)" value={money(saidas)} />
          <Stat label="Resultado do mês" value={<span className={res < 0 ? 'text-red-700' : 'text-emerald-700'}>{money(res)}</span>} hint={entradas > 0 ? `Margem de ${Math.round((res / entradas) * 100)}%` : undefined} />
          <Stat label="Ainda a pagar no mês" value={money(sum(exOpen))} />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card" aria-labelledby="r-ent"><h2 id="r-ent" className="mb-2 font-semibold">Entradas por forma de pagamento</h2>
            <ul className="divide-y divide-slate-100 text-sm">{[...METHODS, ['', 'Sem forma informada'] as const].map(([k, l]) => ({ l, v: sum((rec || []).filter((c) => (c.payment_method || '') === k)) })).filter((x) => x.v > 0).map((x) => <li key={x.l} className="flex justify-between py-1.5"><span>{x.l}</span><b>{money(x.v)}</b></li>)}
              {!rec?.length && <li className="py-1.5 text-slate-500">Nada recebido neste mês.</li>}</ul></section>
          <section className="card" aria-labelledby="r-sai"><h2 id="r-sai" className="mb-2 font-semibold">Saídas por categoria</h2>
            <ul className="divide-y divide-slate-100 text-sm">{cats.map((x) => <li key={x.l} className="flex justify-between py-1.5"><span>{x.l}</span><b>{money(x.v)}</b></li>)}
              {!cats.length && <li className="py-1.5 text-slate-500">Nenhuma despesa paga neste mês. <Link className="underline" href={link({ aba: 'despesas' })}>Lançar despesas</Link></li>}</ul></section>
        </div>
        <p className="mt-3 text-xs text-slate-500">Regime de caixa: conta o que entrou e saiu de fato no mês. Cartão de crédito parcelado entra pelo valor total no dia do pagamento.</p>
      </>
    );
  }

  if (aba === 'comissoes' && isAdmin) {
    const [{ list, semProfissional }, { data: launched }] = await Promise.all([
      monthCommissions(supabase, clinic.id, M.start, M.end),
      supabase.from('expenses').select('professional_id').eq('clinic_id', clinic.id).eq('category', 'comissao').eq('meta->>mes', M.ym).neq('status', 'cancelado'),
    ]);
    const done = new Set((launched || []).map((e) => e.professional_id));
    body = (
      <>
        {monthNav}
        <p className="mb-4 text-sm text-slate-600">Sobre o que foi recebido no mês, pela % de cada profissional (padrão ou por procedimento, em <Link className="underline" href="/app/configuracoes#profissionais">Clínica e equipe</Link>).{semProfissional > 0 && ` ${money(semProfissional)} recebidos sem profissional definido não entram na conta.`}</p>
        {list.length ? list.map((g) => (
          <details key={g.id} className="card mb-3">
            <summary className="flex cursor-pointer flex-wrap items-center gap-3">
              <span className="font-semibold">{g.name}</span>
              <span className="text-sm text-slate-600">base {money(g.base)}</span>
              <span className="font-semibold text-emerald-700">comissão {money(g.total)}</span>
              {writable && g.total > 0 && (done.has(g.id)
                ? <Badge tone="green">lançada nas despesas</Badge>
                : <form action={commissionToExpense}><input type="hidden" name="professional_id" value={g.id} /><input type="hidden" name="mes" value={M.ym} /><input type="hidden" name="valor" value={g.total} /><button className="btn btn-sec min-h-8 px-2 py-1 text-xs" type="submit">Lançar como despesa</button></form>)}
            </summary>
            <table className="tbl mt-3"><thead><tr><th>Data</th><th>Paciente</th><th>Descrição</th><th>Recebido</th><th>%</th><th>Comissão</th></tr></thead><tbody>
              {g.rows.map((r) => <tr key={r.chargeId}><td>{fmtDate(r.paidAt)}</td><td>{r.patient}</td><td>{r.description}</td><td>{money(r.amount)}</td><td>{r.pct}%</td><td>{money(r.value)}</td></tr>)}
            </tbody></table>
          </details>
        )) : <Empty title="Nenhum recebimento com profissional neste mês" />}
      </>
    );
  }

  return (
    <>
      <PageHeader title="Financeiro" desc="Consulta com valor marcada como realizada entra aqui sozinha. Orçamento aprovado vira parcelas. Com a automação de cobrança, os lembretes saem sozinhos em D+1, D+5 e D+10." />
      <nav aria-label="Seções do financeiro" className="mb-6 flex flex-wrap gap-2">
        {abas.map(([k, l]) => <Link key={k} href={link({ aba: k })} aria-current={aba === k ? 'page' : undefined} className={`btn ${aba === k ? 'btn-pri' : 'btn-sec'}`}>{l}</Link>)}
      </nav>
      {body}
    </>
  );
}
