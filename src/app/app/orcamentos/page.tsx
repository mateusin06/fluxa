import Link from 'next/link';
import { getContext } from '@/lib/clinic';
import { PageHeader, Badge, Empty, Stat } from '@/components/bits';
import { fmtDate, money } from '@/lib/utils';
import { NewQuote } from './editor';
import { MobileCollapse } from '@/components/mobile-collapse';

export const metadata = { title: 'Orçamentos' };
const ST_TONE = { rascunho: 'slate', enviado: 'amber', aprovado: 'green', recusado: 'red' } as const;
const STS = ['todos', 'rascunho', 'enviado', 'aprovado', 'recusado'] as const;

export default async function Page({ searchParams }: { searchParams: Promise<{ st?: string; contato?: string }> }) {
  const { supabase, clinic, writable } = await getContext();
  const sp = await searchParams;
  const st = STS.find((x) => x === sp.st) || 'todos';
  let q = supabase.from('quotes').select('id, number, status, created_at, sent_at, approved_at, discount, contact_id, contact:contacts(name), professional:professionals(name), quote_items(qty, unit_price)')
    .eq('clinic_id', clinic.id).order('created_at', { ascending: false }).limit(300);
  if (st !== 'todos') q = q.eq('status', st);
  const d90 = new Date(Date.now() - 90 * 86400000).toISOString();
  const [{ data: list }, { data: pros }, preset, { data: recent }] = await Promise.all([
    q,
    supabase.from('professionals').select('id, name').eq('clinic_id', clinic.id).eq('active', true).order('name'),
    sp.contato && /^[0-9a-f-]{36}$/.test(sp.contato) ? supabase.from('contacts').select('id, name').eq('clinic_id', clinic.id).eq('id', sp.contato).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('quotes').select('status, discount, quote_items(qty, unit_price)').eq('clinic_id', clinic.id).gte('created_at', d90).in('status', ['enviado', 'aprovado', 'recusado']),
  ]);
  const totalOf = (x: { discount: number; quote_items: { qty: number; unit_price: number }[] }) => Math.max(0, x.quote_items.reduce((a, i) => a + i.qty * Number(i.unit_price), 0) - Number(x.discount));
  const r = recent || [];
  const aprov = r.filter((x) => x.status === 'aprovado'), decididos = r.filter((x) => x.status !== 'enviado');
  const pendente = r.filter((x) => x.status === 'enviado');

  return (
    <>
      <PageHeader title="Orçamentos" desc="Plano de tratamento com vários procedimentos, PDF para o paciente e, ao aprovar, parcelas no Financeiro e sessões para agendar." />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Aguardando resposta" value={money(pendente.reduce((a, x) => a + totalOf(x as never), 0))} hint={`${pendente.length} orçamento(s)`} />
        <Stat label="Aprovado (90 dias)" value={money(aprov.reduce((a, x) => a + totalOf(x as never), 0))} hint={`${aprov.length} orçamento(s)`} />
        <Stat label="Taxa de aprovação" value={decididos.length ? `${Math.round((aprov.length / decididos.length) * 100)}%` : '—'} hint="Aprovados ÷ (aprovados + recusados), 90 dias" />
      </div>
      {writable && <div className="mb-6"><MobileCollapse title="Novo orçamento" forceOpen={!!preset.data}><NewQuote pros={pros || []} preset={preset.data} /></MobileCollapse></div>}
      <nav aria-label="Filtrar por situação" className="mb-3 flex flex-wrap gap-1 text-sm">
        {STS.map((x) => <Link key={x} href={`/app/orcamentos${x === 'todos' ? '' : `?st=${x}`}`} aria-current={st === x ? 'page' : undefined} className={`rounded-full border px-3 py-1 capitalize ${st === x ? 'border-ink bg-ink text-white' : 'border-slate-200 bg-white'}`}>{x}</Link>)}
      </nav>
      {list?.length ? (
        <div className="card overflow-x-auto p-0">
          <table className="tbl">
            <thead><tr><th>Nº</th><th>Paciente</th><th>Profissional</th><th>Total</th><th>Situação</th><th>Criado</th></tr></thead>
            <tbody>
              {list.map((x) => (
                <tr key={x.id}>
                  <td><Link className="font-semibold underline" href={`/app/orcamentos/${x.id}`}>{x.number}</Link></td>
                  <td><Link className="underline" href={`/app/contatos/${x.contact_id}`}>{(x.contact as unknown as { name: string } | null)?.name}</Link></td>
                  <td>{(x.professional as unknown as { name: string } | null)?.name || '—'}</td>
                  <td>{money(totalOf(x as never))}</td>
                  <td><Badge tone={ST_TONE[x.status as keyof typeof ST_TONE]}>{x.status}</Badge></td>
                  <td>{fmtDate(x.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty title="Nenhum orçamento ainda" />}
    </>
  );
}
