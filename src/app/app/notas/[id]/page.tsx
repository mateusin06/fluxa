import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getContext } from '@/lib/clinic';
import { PageHeader, Badge } from '@/components/bits';
import { fmtDate, fmtDateTime, money } from '@/lib/utils';
import { recheckInvoice } from '../actions';
import { CancelForm } from '../forms';

const TONE = { processando: 'amber', autorizada: 'green', rejeitada: 'red', erro: 'red', cancelada: 'slate' } as const;

export default async function NotaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, clinic, isAdmin } = await getContext();
  if (!isAdmin) notFound();
  const { data: n } = await supabase.from('nfse').select('*').eq('id', id).eq('clinic_id', clinic.id).maybeSingle();
  if (!n) notFound();
  const t = n.tomador as { doc?: string; nome?: string; email?: string };
  const sv = n.servico as { cTribNac?: string; issRetido?: boolean; aliquota?: number | null };
  const erros = (n.erros as { codigo: string; descricao: string }[] | null) || [];
  return (
    <>
      <PageHeader title={n.numero ? `NFS-e nº ${n.numero}` : `DPS ${n.serie}/${n.n_dps}`} desc={`${t.nome || ''} · ${money(Number(n.valor))} · emitida em ${fmtDateTime(n.created_at)}${n.ambiente === '2' ? ' · AMBIENTE DE TESTE' : ''}`}>
        <Badge tone={TONE[n.status as keyof typeof TONE]}>{n.status}</Badge>
        <Link className="btn btn-sec" href="/app/notas?aba=emitidas">Voltar</Link>
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card space-y-2 text-sm">
          <h2 className="font-semibold">Dados</h2>
          <p><b>Tomador:</b> {t.nome} · {t.doc}{t.email ? ` · ${t.email}` : ''}</p>
          <p><b>Serviço:</b> {n.descricao}</p>
          <p><b>Valor:</b> {money(Number(n.valor))}{Number(n.desconto) > 0 ? ` · desconto ${money(Number(n.desconto))}` : ''} · <b>Competência:</b> {fmtDate(n.competencia + 'T12:00:00Z')}</p>
          <p><b>Código de tributação:</b> {sv.cTribNac}{sv.issRetido ? ' · ISS retido pelo tomador' : ''}{sv.aliquota ? ` · alíquota ${sv.aliquota}%` : ''}</p>
          {n.chave_acesso && <p className="break-all"><b>Chave de acesso:</b> {n.chave_acesso}</p>}
          {n.dps_id && <p className="break-all text-xs text-slate-500">DPS: {n.dps_id}</p>}
          {n.cancel_motivo && <p><b>Cancelada:</b> {n.cancel_motivo}</p>}
          <div className="flex flex-wrap gap-2 pt-2">
            {n.status === 'autorizada' && <a className="btn btn-pri" href={`/app/notas/${n.id}/pdf`} target="_blank" rel="noreferrer">PDF da nota</a>}
            {n.xml_nfse && <a className="btn btn-sec" href={`/app/notas/${n.id}/xml?tipo=nfse`}>XML da NFS-e</a>}
            {n.xml_dps && <a className="btn btn-sec" href={`/app/notas/${n.id}/xml?tipo=dps`}>XML da DPS assinada</a>}
            {n.chave_acesso && <a className="btn btn-sec" href="https://www.nfse.gov.br/consultapublica" target="_blank" rel="noreferrer">Consulta pública (gov.br)</a>}
          </div>
        </section>
        <div className="space-y-6">
          {erros.length > 0 && (
            <section className="card space-y-2 text-sm">
              <h2 className="font-semibold">{n.status === 'erro' ? 'Falha no envio' : 'Retorno da Sefin'}</h2>
              <ul className="list-disc space-y-1 pl-5">{erros.map((e, i) => <li key={i}><b>{e.codigo}</b>: {e.descricao}</li>)}</ul>
              {['erro', 'processando'].includes(n.status) && <form action={recheckInvoice}><input type="hidden" name="id" value={n.id} /><button className="btn btn-sec" type="submit">Consultar de novo na Sefin</button></form>}
              {n.status === 'rejeitada' && <p className="text-slate-600">Corrija o que a Sefin apontou e <Link className="underline" href={`/app/notas${n.charge_id ? `?cobranca=${n.charge_id}` : ''}`}>emita de novo</Link>.</p>}
            </section>
          )}
          {n.status === 'autorizada' && <CancelForm id={n.id} />}
        </div>
      </div>
    </>
  );
}
