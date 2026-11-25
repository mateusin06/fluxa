import Link from 'next/link';
import { getContext } from '@/lib/clinic';
import { PageHeader, Badge, Stat, Empty } from '@/components/bits';
import { fmtDate, money } from '@/lib/utils';
import { ChargeForm } from './form';
import { setChargeStatus } from './actions';

export const metadata = { title: 'Financeiro' };

export default async function Page({ searchParams }: { searchParams: Promise<{ st?: string }> }) {
  const { supabase, clinic, writable } = await getContext();
  const st = (await searchParams).st === 'pago' ? 'pago' : 'aberto';
  const today = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
  const [{ data: list }, { data: open }] = await Promise.all([
    supabase.from('charges').select('id, description, amount, due_date, status, payment_link, paid_at, meta, contact_id, contact:contacts(name)').eq('clinic_id', clinic.id).eq('status', st).order('due_date').limit(500),
    supabase.from('charges').select('amount, due_date').eq('clinic_id', clinic.id).eq('status', 'aberto'),
  ]);
  const late = (open || []).filter((c) => c.due_date < today);
  const sum = (a: { amount: number }[]) => a.reduce((x, c) => x + Number(c.amount), 0);
  return (
    <>
      <PageHeader title="Financeiro" desc="Contas a receber dos pacientes. Consulta com valor marcada como realizada entra aqui sozinha. Com a automação de cobrança ativa, os lembretes de pagamento saem sozinhos em D+1, D+5 e D+10.">
        <Link href="/app/financeiro" className={`btn ${st === 'aberto' ? 'btn-pri' : 'btn-sec'}`}>Em aberto</Link>
        <Link href="/app/financeiro?st=pago" className={`btn ${st === 'pago' ? 'btn-pri' : 'btn-sec'}`}>Pagas</Link>
      </PageHeader>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat label="Em aberto" value={money(sum(open || []))} />
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
                  <td><Link className="underline" href={`/app/contatos/${c.contact_id}`}>{(c.contact as unknown as { name: string } | null)?.name}</Link></td>
                  <td>{c.description}{(c.meta as { forma?: string } | null)?.forma === 'balcao' && c.status === 'aberto' && <> <Badge tone="amber">balcão</Badge></>}{c.payment_link && <> · <a className="underline" href={c.payment_link} target="_blank" rel="noreferrer">link</a></>}</td>
                  <td>{money(c.amount)}</td>
                  <td>{fmtDate(c.due_date + 'T12:00:00Z')} {c.status === 'aberto' && c.due_date < today && <Badge tone="red">vencida</Badge>}</td>
                  <td className="text-xs text-slate-500">{(c.meta as { etapa_cobranca?: string })?.etapa_cobranca || '—'}</td>
                  <td>{writable && c.status === 'aberto' && (
                    <span className="flex gap-1">
                      <form action={setChargeStatus}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="status" value="pago" /><button className="btn btn-sec min-h-8 px-2 py-1 text-xs" type="submit">Pago</button></form>
                      <form action={setChargeStatus}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="status" value="cancelado" /><button className="btn btn-danger min-h-8 px-2 py-1 text-xs" type="submit">Cancelar</button></form>
                    </span>
                  )}{c.status === 'pago' && <span className="text-xs">pago {fmtDate(c.paid_at)}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty title={st === 'aberto' ? 'Nenhuma cobrança em aberto' : 'Nenhuma cobrança paga'} />}
    </>
  );
}
