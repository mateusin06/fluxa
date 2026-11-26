import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getContext } from '@/lib/clinic';
import { createAdminClient } from '@/lib/supabase/admin';
import { PageHeader, Badge, Empty } from '@/components/bits';
import { fmtDate, fmtDateTime, money } from '@/lib/utils';
import { configGaps, SERVICOS_SUGERIDOS, type FiscalConfig } from '@/lib/nfse';
import { EmitForm, FiscalConfigForm, type CfgView, type EmitPreset } from './forms';

export const metadata = { title: 'Notas fiscais' };
const TONE_NF = { processando: 'amber', autorizada: 'green', rejeitada: 'red', erro: 'red', cancelada: 'slate' } as const;
const UUID = /^[0-9a-f-]{36}$/i;
const S = (v: unknown) => (v === null || v === undefined ? '' : String(v));

export default async function NotasPage({ searchParams }: { searchParams: Promise<{ aba?: string; cobranca?: string }> }) {
  const { supabase, clinic, isAdmin } = await getContext();
  const sp = await searchParams;
  if (!isAdmin) {
    return (<><PageHeader title="Notas fiscais" /><Empty title="Só o dono ou um administrador emite notas fiscais">Peça acesso de administrador em Clínica e equipe.</Empty></>);
  }
  const { data: cfgRow } = await createAdminClient().from('nfse_config').select('*').eq('clinic_id', clinic.id).maybeSingle();
  const cfg = cfgRow as FiscalConfig | null;
  const gaps = configGaps(cfg);
  // sem aba na URL: vai para a certa (assim, ao salvar a configuração, a tela não pula para outra aba)
  if (!sp.aba) redirect(`/app/notas?aba=${gaps.length ? 'config' : 'emitir'}${sp.cobranca ? `&cobranca=${sp.cobranca}` : ''}`);
  const aba = sp.aba === 'emitidas' || sp.aba === 'config' ? sp.aba : 'emitir';

  // emitir a partir de uma cobrança recebida
  let preset: EmitPreset = { competencia: new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10) };
  let jaTem: { id: string; numero: string | null; status: string } | null = null;
  if (sp.cobranca && UUID.test(sp.cobranca)) {
    const { data: ch } = await supabase.from('charges').select('id, amount, description, paid_at, due_date, contact_id, contact:contacts(name, document, email, phone), appointment:appointments(starts_at)')
      .eq('id', sp.cobranca).eq('clinic_id', clinic.id).maybeSingle();
    if (ch) {
      const ct = ch.contact as unknown as { name: string; document: string | null; email: string | null; phone: string | null } | null;
      const ap = ch.appointment as unknown as { starts_at: string } | null;
      const quando = ap?.starts_at || ch.paid_at || ch.due_date + 'T12:00:00Z';
      preset = {
        charge_id: ch.id, contact_id: ch.contact_id, t_doc: S(ct?.document).replace(/\D/g, ''), t_nome: ct?.name || '', t_email: ct?.email || '', t_fone: ct?.phone ? ct.phone.replace(/^55/, '') : '',
        valor: Number(ch.amount).toFixed(2).replace('.', ','), descricao: [cfg?.descricao_padrao, ch.description].filter(Boolean).join(' · '),
        competencia: new Date(new Date(quando).getTime() - 3 * 3600000).toISOString().slice(0, 10),
      };
      const { data: nf } = await supabase.from('nfse').select('id, numero, status').eq('charge_id', ch.id).in('status', ['autorizada', 'processando']).limit(1).maybeSingle();
      jaTem = nf;
    }
  }

  const tabs: [string, string][] = [['emitir', 'Emitir nota'], ['emitidas', 'Notas emitidas'], ['config', 'Configuração fiscal']];
  let body: React.ReactNode;
  if (aba === 'config') {
    const v: CfgView = {
      ambiente: S(cfg?.ambiente || '2'), documento: S(cfg?.documento || S(clinic.document).replace(/\D/g, '')), inscricao_municipal: S(cfg?.inscricao_municipal), razao_social: S(cfg?.razao_social || clinic.name.replace(/\s*\(demonstração\)/, '')),
      cod_municipio: S(cfg?.cod_municipio), uf: S(cfg?.uf || clinic.state), cep: S(cfg?.cep), logradouro: S(cfg?.logradouro), numero: S(cfg?.numero), complemento: S(cfg?.complemento), bairro: S(cfg?.bairro),
      fone: S(cfg?.fone || S(clinic.phone).replace(/^55/, '')), email: S(cfg?.email || clinic.email), op_simples: S(cfg?.op_simples || '3'), reg_ap_trib_sn: S(cfg?.reg_ap_trib_sn || '1'), reg_esp_trib: S(cfg?.reg_esp_trib || '0'),
      p_tot_trib_sn: cfg?.p_tot_trib_sn === null || cfg?.p_tot_trib_sn === undefined ? '' : Number(cfg.p_tot_trib_sn).toFixed(2).replace('.', ','), serie: S(cfg?.serie || '1'), ultimo_ndps: S(cfg?.ultimo_ndps ?? 0),
      c_trib_nac: S(cfg?.c_trib_nac || (clinic.kind === 'odonto' ? '041201' : '060201')), c_trib_mun: S(cfg?.c_trib_mun), c_nbs: S(cfg?.c_nbs),
      descricao_padrao: S(cfg?.descricao_padrao || (clinic.kind === 'odonto' ? 'Tratamento odontológico' : 'Procedimento estético')), trib_issqn: S(cfg?.trib_issqn || '1'),
      aliquota: cfg?.aliquota === null || cfg?.aliquota === undefined ? '' : Number(cfg.aliquota).toFixed(2).replace('.', ','),
      cert_subject: S(cfg?.cert_subject), cert_valid_to: cfg?.cert_valid_to ? fmtDate(cfg.cert_valid_to) : '', cidade: S(clinic.city),
    };
    body = (
      <>
        {gaps.length > 0 && <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Para emitir, falta: {gaps.join(', ')}.</p>}
        <FiscalConfigForm c={v} servicos={SERVICOS_SUGERIDOS} />
      </>
    );
  } else if (aba === 'emitidas') {
    const { data: list } = await supabase.from('nfse').select('id, status, numero, n_dps, serie, ambiente, valor, competencia, tomador, created_at').eq('clinic_id', clinic.id).order('created_at', { ascending: false }).limit(300);
    body = list?.length ? (
      <div className="card overflow-x-auto p-0">
        <table className="tbl">
          <thead><tr><th>Tomador</th><th>Nº NFS-e</th><th>DPS</th><th>Valor</th><th>Competência</th><th>Situação</th><th /></tr></thead>
          <tbody>
            {list.map((n) => (
              <tr key={n.id}>
                <td><Link className="underline" href={`/app/notas/${n.id}`}>{(n.tomador as { nome?: string })?.nome || '—'}</Link></td>
                <td>{n.numero || '—'}</td>
                <td className="text-xs text-slate-500">{n.serie}/{n.n_dps}{n.ambiente === '2' ? ' · teste' : ''}</td>
                <td>{money(Number(n.valor))}</td>
                <td>{fmtDate(n.competencia + 'T12:00:00Z')}</td>
                <td><Badge tone={TONE_NF[n.status as keyof typeof TONE_NF]}>{n.status}</Badge></td>
                <td className="text-xs text-slate-500">{fmtDateTime(n.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : <Empty title="Nenhuma nota emitida ainda" />;
  } else {
    body = gaps.length ? (
      <Empty title="Complete a configuração fiscal"><Link className="underline" href="/app/notas?aba=config">Falta: {gaps.join(', ')}.</Link></Empty>
    ) : (
      <>
        {jaTem && <p className="mb-4 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">Essa cobrança já tem nota {jaTem.status === 'autorizada' ? `emitida${jaTem.numero ? ` (nº ${jaTem.numero})` : ''}` : 'em processamento'}. <Link className="underline" href={`/app/notas/${jaTem.id}`}>Ver nota</Link></p>}
        {!preset.t_doc && preset.charge_id && <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">O paciente não tem CPF no cadastro: preencha abaixo (e salve no cadastro dele para as próximas).</p>}
        <EmitForm preset={preset} cfg={{ descricao_padrao: cfg?.descricao_padrao || '', c_trib_nac: cfg?.c_trib_nac || '' }} servicos={SERVICOS_SUGERIDOS} teste={cfg?.ambiente !== '1'} />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Notas fiscais" desc="NFS-e no padrão nacional (Emissor Nacional da Receita, gov.br): sem custo por nota, assinada com o certificado A1 da clínica." />
      <nav aria-label="Seções" className="mb-6 flex flex-wrap gap-2">
        {tabs.map(([k, l]) => <Link key={k} href={`/app/notas?aba=${k}`} aria-current={aba === k ? 'page' : undefined} className={`btn ${aba === k ? 'btn-pri' : 'btn-sec'}`}>{l}</Link>)}
      </nav>
      {body}
    </>
  );
}
