import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getContext } from '@/lib/clinic';
import { PageHeader, Badge } from '@/components/bits';
import { fmtDate, fmtDateTime, money, waLink, firstName } from '@/lib/utils';
import { methodLabel } from '@/lib/payments';
import { ApproveQuote, QuoteEditor, SendQuote } from '../editor';
import { deleteQuote, refuseQuote, reopenQuote } from '../actions';

const TONE = { rascunho: 'slate', enviado: 'amber', aprovado: 'green', recusado: 'red' } as const;

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, clinic, writable } = await getContext();
  const { data: q } = await supabase.from('quotes').select('*, contact:contacts(id, name, phone), professional:professionals(name)').eq('id', id).eq('clinic_id', clinic.id).maybeSingle();
  if (!q) notFound();
  const [{ data: items }, { data: procs }, { data: pros }, { data: charges }] = await Promise.all([
    supabase.from('quote_items').select('id, procedure_id, description, region, qty, unit_price').eq('quote_id', id).order('position'),
    supabase.from('procedures').select('id, name, price').eq('clinic_id', clinic.id).eq('active', true).order('name'),
    supabase.from('professionals').select('id, name').eq('clinic_id', clinic.id).eq('active', true).order('name'),
    supabase.from('charges').select('id, description, amount, due_date, status, paid_at, payment_method, installments').eq('quote_id', id).order('due_date'),
  ]);
  const c = q.contact as { id: string; name: string; phone: string | null };
  const total = Math.max(0, (items || []).reduce((a, i) => a + i.qty * Number(i.unit_price), 0) - Number(q.discount));
  const editable = writable && ['rascunho', 'enviado'].includes(q.status);
  const pay = q.payment as { forma?: string; parcelas?: number } | null;
  const msg = `Oi, ${firstName(c.name)}! Segue o seu orçamento nº ${q.number} da ${clinic.name}: ${(items || []).map((i) => `${i.description}${i.qty > 1 ? ` (${i.qty} sessões)` : ''}`).join(', ')}. Total ${money(total)}${q.valid_until ? `, válido até ${fmtDate(q.valid_until + 'T12:00:00Z')}` : ''}. Estou enviando o PDF com os detalhes. Qualquer dúvida, é só me chamar por aqui.`;

  return (
    <>
      <PageHeader title={`Orçamento nº ${q.number}`} desc={`${c.name} · criado em ${fmtDate(q.created_at)}${q.sent_at ? ` · enviado em ${fmtDateTime(q.sent_at)}` : ''}`}>
        <Badge tone={TONE[q.status as keyof typeof TONE]}>{q.status}</Badge>
        <Link className="btn btn-sec" href={`/app/contatos/${c.id}`}>Ficha do paciente</Link>
      </PageHeader>
      <div className="space-y-6">
        <div className="card flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">{q.status === 'rascunho' ? 'Salve os itens, baixe o PDF e envie ao paciente.' : q.status === 'enviado' ? 'Aguardando o paciente. Quando ele aprovar, registre o pagamento abaixo.' : q.status === 'aprovado' ? `Aprovado em ${fmtDate(q.approved_at)}${pay?.forma ? ` · ${methodLabel(pay.forma)}${pay.parcelas && pay.parcelas > 1 ? ` em ${pay.parcelas}x` : ''}` : ''}.` : `Recusado${q.refused_reason ? `: ${q.refused_reason}` : ''}.`}</p>
          <SendQuote id={q.id} href={c.phone && q.status !== 'recusado' ? waLink(c.phone, msg) : null} sent={q.status !== 'rascunho'} />
        </div>

        <QuoteEditor key={q.id + q.status} kind={clinic.kind} editable={editable} procs={(procs || []).map((p) => ({ ...p, price: p.price === null ? null : Number(p.price) }))} pros={pros || []}
          q={{ id: q.id, professional_id: q.professional_id, discount: Number(q.discount), notes: q.notes, valid_until: q.valid_until }}
          items={(items || []).map((i) => ({ procedure_id: i.procedure_id, description: i.description, region: i.region || '', qty: i.qty, unit_price: String(Number(i.unit_price).toFixed(2)).replace('.', ',') }))} />

        {editable && total > 0 && <ApproveQuote id={q.id} total={total} />}

        {editable && (
          <form action={refuseQuote} className="card flex flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={q.id} />
            <div className="flex-1"><label className="label" htmlFor="rf">Paciente recusou? Motivo (ajuda a entender o que perde venda)</label><input id="rf" name="reason" maxLength={300} placeholder="Preço, vai pensar, fez em outro lugar..." className="field" /></div>
            <button className="btn btn-danger" type="submit">Marcar como recusado</button>
          </form>
        )}
        {writable && q.status === 'recusado' && <form action={reopenQuote}><input type="hidden" name="id" value={q.id} /><button className="btn btn-sec" type="submit">Reabrir orçamento</button></form>}

        {charges && charges.length > 0 && (
          <section className="card" aria-labelledby="q-fin">
            <h2 id="q-fin" className="mb-2 font-semibold">No Financeiro</h2>
            <ul className="divide-y divide-slate-100 text-sm">
              {charges.map((ch) => (
                <li key={ch.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <span>{ch.description} · vence {fmtDate(ch.due_date + 'T12:00:00Z')}</span>
                  <span className="flex items-center gap-2"><b>{money(ch.amount)}</b>
                    {ch.status === 'pago' ? <><Badge tone="green">pago</Badge><a className="text-xs underline" href={`/app/financeiro/recibo/${ch.id}`} target="_blank" rel="noreferrer">recibo</a></> : <Badge tone={ch.status === 'cancelado' ? 'slate' : 'amber'}>{ch.status}</Badge>}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {writable && ['rascunho', 'recusado'].includes(q.status) && (
          <form action={deleteQuote}><input type="hidden" name="id" value={q.id} /><button className="text-sm text-red-700 underline" type="submit">Excluir orçamento</button></form>
        )}
      </div>
    </>
  );
}
