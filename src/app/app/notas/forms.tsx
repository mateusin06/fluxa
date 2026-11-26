'use client';
import { useActionState, useState, useTransition, type FormEvent } from 'react';
import Link from 'next/link';
import { FormMsg } from '@/components/ui';
import { cancelInvoice, emitInvoice, saveFiscalConfig } from './actions';

const dig = (s: string) => s.replace(/\D/g, '');

/**
 * Envia sem limpar o formulário: o React 19 apaga os campos depois de uma "form action",
 * e aqui a pessoa digitou muita coisa (se der erro, ela só corrige o campo apontado).
 */
type St = { error?: string; ok?: string; id?: string } | null;
function useKeepForm(action: (s: St, fd: FormData) => Promise<St>) {
  const [state, dispatch, pending] = useActionState<St, FormData>(action, null);
  const [, start] = useTransition();
  const onSubmit = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const fd = new FormData(e.currentTarget); start(() => dispatch(fd)); };
  return { state, pending, onSubmit };
}
function Btn({ pending, children, busy, variant = 'pri' }: { pending: boolean; children: React.ReactNode; busy: string; variant?: 'pri' | 'danger' }) {
  return <button type="submit" disabled={pending} className={`btn btn-${variant}`}>{pending ? busy : children}</button>;
}


/** Busca o endereço e o código IBGE do município pelo CEP (ViaCEP, grátis). */
async function viaCep(cep: string) {
  const c = dig(cep);
  if (c.length !== 8) throw new Error('CEP com 8 dígitos');
  const r = await fetch(`https://viacep.com.br/ws/${c}/json/`);
  const j = await r.json();
  if (!r.ok || j.erro) throw new Error('CEP não encontrado');
  return j as { logradouro: string; bairro: string; localidade: string; uf: string; ibge: string };
}

function Msg({ s }: { s: { error?: string; ok?: string } | null }) {
  if (!s) return null;
  return <div className="whitespace-pre-line"><FormMsg state={s} /></div>;
}

export interface CfgView {
  ambiente: string; documento: string; inscricao_municipal: string; razao_social: string; cod_municipio: string; uf: string; cep: string;
  logradouro: string; numero: string; complemento: string; bairro: string; fone: string; email: string; op_simples: string; reg_ap_trib_sn: string;
  reg_esp_trib: string; p_tot_trib_sn: string; serie: string; ultimo_ndps: string; c_trib_nac: string; c_trib_mun: string; c_nbs: string;
  descricao_padrao: string; trib_issqn: string; aliquota: string; cert_subject: string; cert_valid_to: string; cidade: string;
}

export function FiscalConfigForm({ c, servicos }: { c: CfgView; servicos: [string, string][] }) {
  const { state: s, pending, onSubmit } = useKeepForm(saveFiscalConfig);
  const [addr, setAddr] = useState({ cep: c.cep, logradouro: c.logradouro, bairro: c.bairro, cod_municipio: c.cod_municipio, uf: c.uf, cidade: c.cidade });
  const [cepMsg, setCepMsg] = useState('');
  const [op, setOp] = useState(c.op_simples || '3');
  const [trib, setTrib] = useState(c.c_trib_nac);
  async function buscar() {
    setCepMsg('Buscando...');
    try { const j = await viaCep(addr.cep); setAddr({ ...addr, logradouro: j.logradouro, bairro: j.bairro, cod_municipio: j.ibge, uf: j.uf, cidade: j.localidade }); setCepMsg(`${j.localidade}/${j.uf} · IBGE ${j.ibge}`); }
    catch (e) { setCepMsg((e as Error).message); }
  }
  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <section className="card space-y-3">
        <h2 className="font-semibold">Ambiente</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm"><input type="radio" name="ambiente" value="2" defaultChecked={c.ambiente !== '1'} className="mt-1" /><span><b>Produção restrita (teste)</b><br /><span className="text-slate-600">Ambiente oficial de testes da Receita. A nota não tem valor fiscal. Comece por aqui.</span></span></label>
          <label className="flex items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm"><input type="radio" name="ambiente" value="1" defaultChecked={c.ambiente === '1'} className="mt-1" /><span><b>Produção</b><br /><span className="text-slate-600">Nota real, com valor fiscal. Só mude depois de emitir uma nota de teste com sucesso.</span></span></label>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Clínica (prestador do serviço)</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><label className="label" htmlFor="fc-doc">CNPJ (ou CPF do profissional)</label><input id="fc-doc" name="documento" inputMode="numeric" defaultValue={c.documento} required className="field" /></div>
          <div><label className="label" htmlFor="fc-im">Inscrição municipal</label><input id="fc-im" name="inscricao_municipal" defaultValue={c.inscricao_municipal} className="field" placeholder="Se a prefeitura exigir" /></div>
          <div><label className="label" htmlFor="fc-rs">Razão social</label><input id="fc-rs" name="razao_social" defaultValue={c.razao_social} className="field" /></div>
          <div>
            <label className="label" htmlFor="fc-cep">CEP da clínica</label>
            <div className="flex gap-2"><input id="fc-cep" name="cep" inputMode="numeric" value={addr.cep} onChange={(e) => setAddr({ ...addr, cep: e.target.value })} className="field" /><button type="button" onClick={buscar} className="btn btn-sec shrink-0">Buscar CEP</button></div>
            {cepMsg && <p className="mt-1 text-xs text-slate-500">{cepMsg}</p>}
          </div>
          <div><label className="label" htmlFor="fc-mun">Código IBGE do município</label><input id="fc-mun" name="cod_municipio" inputMode="numeric" value={addr.cod_municipio} onChange={(e) => setAddr({ ...addr, cod_municipio: e.target.value })} required className="field" placeholder="7 dígitos" /></div>
          <div><label className="label" htmlFor="fc-uf">UF</label><input id="fc-uf" name="uf" maxLength={2} value={addr.uf} onChange={(e) => setAddr({ ...addr, uf: e.target.value.toUpperCase() })} className="field" /></div>
          <div className="sm:col-span-2"><label className="label" htmlFor="fc-lg">Endereço</label><input id="fc-lg" name="logradouro" value={addr.logradouro} onChange={(e) => setAddr({ ...addr, logradouro: e.target.value })} className="field" /></div>
          <div><label className="label" htmlFor="fc-nr">Número</label><input id="fc-nr" name="numero" defaultValue={c.numero} className="field" /></div>
          <div><label className="label" htmlFor="fc-cp">Complemento</label><input id="fc-cp" name="complemento" defaultValue={c.complemento} className="field" /></div>
          <div><label className="label" htmlFor="fc-br">Bairro</label><input id="fc-br" name="bairro" value={addr.bairro} onChange={(e) => setAddr({ ...addr, bairro: e.target.value })} className="field" /></div>
          <div><label className="label" htmlFor="fc-fone">Telefone</label><input id="fc-fone" name="fone" inputMode="tel" defaultValue={c.fone} className="field" /></div>
          <div className="sm:col-span-2"><label className="label" htmlFor="fc-mail">E-mail</label><input id="fc-mail" name="email" type="email" defaultValue={c.email} className="field" /></div>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Regime tributário</h2>
        <p className="text-sm text-slate-600">Na dúvida, copie do seu contador ou da última nota emitida pela prefeitura.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><label className="label" htmlFor="fc-op">Simples Nacional</label><select id="fc-op" name="op_simples" value={op} onChange={(e) => setOp(e.target.value)} className="field"><option value="3">Optante: ME ou EPP</option><option value="2">Optante: MEI</option><option value="1">Não optante</option></select></div>
          {op === '3' && <div><label className="label" htmlFor="fc-ap">Apuração dos tributos</label><select id="fc-ap" name="reg_ap_trib_sn" defaultValue={c.reg_ap_trib_sn || '1'} className="field"><option value="1">Federais e ISS pelo Simples</option><option value="2">Federais pelo Simples, ISS fora</option><option value="3">Federais e ISS fora do Simples</option></select></div>}
          {op === '3' && <div><label className="label" htmlFor="fc-pt">% aproximado de tributos (Simples)</label><input id="fc-pt" name="p_tot_trib_sn" inputMode="decimal" defaultValue={c.p_tot_trib_sn} placeholder="Ex.: 6,00" required className="field" /><p className="mt-1 text-xs text-slate-500">Alíquota efetiva do Simples. Sai na nota (Lei da Transparência).</p></div>}
          <div><label className="label" htmlFor="fc-esp">Regime especial</label><select id="fc-esp" name="reg_esp_trib" defaultValue={c.reg_esp_trib || '0'} className="field"><option value="0">Nenhum</option><option value="1">Ato cooperado</option><option value="2">Estimativa</option><option value="3">Microempresa municipal</option><option value="4">Notário ou registrador</option><option value="5">Profissional autônomo</option><option value="6">Sociedade de profissionais</option><option value="9">Outros</option></select></div>
          <div><label className="label" htmlFor="fc-ti">ISS</label><select id="fc-ti" name="trib_issqn" defaultValue={c.trib_issqn || '1'} className="field"><option value="1">Operação tributável</option><option value="2">Imunidade</option><option value="3">Exportação de serviço</option><option value="4">Não incidência</option></select></div>
          <div><label className="label" htmlFor="fc-al">Alíquota do ISS (%)</label><input id="fc-al" name="aliquota" inputMode="decimal" defaultValue={c.aliquota} placeholder="Vazio: a prefeitura define" className="field" /></div>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Serviço padrão</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="fc-ctn">Código de tributação nacional</label>
            <input id="fc-ctn" name="c_trib_nac" inputMode="numeric" list="fc-ctn-l" value={trib} onChange={(e) => setTrib(dig(e.target.value).slice(0, 6))} required className="field" placeholder="6 dígitos" />
            <datalist id="fc-ctn-l">{servicos.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</datalist>
            <p className="mt-1 text-xs text-slate-500">{servicos.find(([k]) => k === trib)?.[1] || 'Item da lista de serviços (LC 116) + desdobramento. Sugestões no campo; confirme com o contador.'}</p>
          </div>
          <div><label className="label" htmlFor="fc-ctm">Código municipal (opcional)</label><input id="fc-ctm" name="c_trib_mun" inputMode="numeric" maxLength={3} defaultValue={c.c_trib_mun} className="field" placeholder="3 dígitos" /></div>
          <div><label className="label" htmlFor="fc-nbs">Código NBS (opcional)</label><input id="fc-nbs" name="c_nbs" inputMode="numeric" maxLength={9} defaultValue={c.c_nbs} className="field" placeholder="9 dígitos" /></div>
          <div className="sm:col-span-2"><label className="label" htmlFor="fc-ds">Descrição padrão do serviço</label><input id="fc-ds" name="descricao_padrao" maxLength={1000} defaultValue={c.descricao_padrao} className="field" placeholder="Ex.: Tratamento odontológico" /></div>
          <div><label className="label" htmlFor="fc-se">Série da DPS</label><input id="fc-se" name="serie" inputMode="numeric" maxLength={5} defaultValue={c.serie || '1'} className="field" /></div>
          <div><label className="label" htmlFor="fc-un">Último número de DPS usado</label><input id="fc-un" name="ultimo_ndps" inputMode="numeric" defaultValue={c.ultimo_ndps || '0'} className="field" /><p className="mt-1 text-xs text-slate-500">Se já emitia por outro sistema com a mesma série, coloque o último número. Só pode aumentar.</p></div>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Certificado digital A1</h2>
        <p className="text-sm text-slate-600">{c.cert_subject ? <>Atual: <b>{c.cert_subject}</b>, válido até {c.cert_valid_to}. Envie outro só para trocar.</> : 'Necessário para assinar a nota e conectar na Sefin Nacional. É o arquivo .pfx (ou .p12) do certificado A1 da clínica (e-CNPJ). O A3 (cartão ou token) não funciona em sistema na nuvem.'}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor="fc-cert">Arquivo do certificado (.pfx)</label><input id="fc-cert" name="cert" type="file" accept=".pfx,.p12,application/x-pkcs12" className="block w-full text-sm" /></div>
          <div><label className="label" htmlFor="fc-pw">Senha do certificado</label><input id="fc-pw" name="cert_password" type="password" autoComplete="off" className="field" /></div>
        </div>
        <p className="text-xs text-slate-500">O certificado fica guardado cifrado no servidor e nunca volta para o navegador.</p>
      </section>
      <div className="flex flex-wrap items-center gap-3"><Btn pending={pending} busy="Salvando...">Salvar configuração</Btn><Msg s={s} />{s?.ok && <Link className="btn btn-lima" href="/app/notas?aba=emitir">Emitir nota</Link>}</div>
    </form>
  );
}

export interface EmitPreset { charge_id?: string; contact_id?: string; t_doc?: string; t_nome?: string; t_email?: string; t_fone?: string; valor?: string; descricao?: string; competencia?: string }

export function EmitForm({ preset, cfg, servicos, teste }: { preset: EmitPreset; cfg: { descricao_padrao: string; c_trib_nac: string }; servicos: [string, string][]; teste: boolean }) {
  const { state: s, pending, onSubmit } = useKeepForm(emitInvoice);
  const [addr, setAddr] = useState({ cep: '', logradouro: '', bairro: '', cmun: '', cidade: '' });
  const [cepMsg, setCepMsg] = useState('');
  const [end, setEnd] = useState(false);
  async function buscar() {
    setCepMsg('Buscando...');
    try { const j = await viaCep(addr.cep); setAddr({ ...addr, logradouro: j.logradouro, bairro: j.bairro, cmun: j.ibge, cidade: `${j.localidade}/${j.uf}` }); setCepMsg(`${j.localidade}/${j.uf} · IBGE ${j.ibge}`); }
    catch (e) { setCepMsg((e as Error).message); }
  }
  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {teste && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Ambiente de TESTE (produção restrita): a nota sai na Receita, mas sem valor fiscal. Mude para Produção em Configuração fiscal quando estiver tudo certo.</p>}
      <input type="hidden" name="charge_id" value={preset.charge_id || ''} />
      <input type="hidden" name="contact_id" value={preset.contact_id || ''} />
      <section className="card space-y-3">
        <h2 className="font-semibold">Quem recebe a nota (tomador)</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor="nf-doc">CPF ou CNPJ</label><input id="nf-doc" name="t_doc" inputMode="numeric" required defaultValue={preset.t_doc} className="field" /></div>
          <div><label className="label" htmlFor="nf-nome">Nome completo ou razão social</label><input id="nf-nome" name="t_nome" required maxLength={150} defaultValue={preset.t_nome} className="field" /></div>
          <div><label className="label" htmlFor="nf-mail">E-mail (opcional)</label><input id="nf-mail" name="t_email" type="email" defaultValue={preset.t_email} className="field" /></div>
          <div><label className="label" htmlFor="nf-fone">Telefone (opcional)</label><input id="nf-fone" name="t_fone" inputMode="tel" defaultValue={preset.t_fone} className="field" /></div>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={end} onChange={(e) => setEnd(e.target.checked)} /> Incluir endereço do tomador (algumas prefeituras e empresas pedem)</label>
        {end && (
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="nf-cep">CEP</label>
              <div className="flex gap-2"><input id="nf-cep" name="t_cep" inputMode="numeric" value={addr.cep} onChange={(e) => setAddr({ ...addr, cep: e.target.value })} className="field" /><button type="button" onClick={buscar} className="btn btn-sec shrink-0">Buscar</button></div>
              {cepMsg && <p className="mt-1 text-xs text-slate-500">{cepMsg}</p>}
            </div>
            <div className="sm:col-span-2"><label className="label" htmlFor="nf-lg">Rua</label><input id="nf-lg" name="t_logradouro" value={addr.logradouro} onChange={(e) => setAddr({ ...addr, logradouro: e.target.value })} className="field" /></div>
            <div><label className="label" htmlFor="nf-nr">Número</label><input id="nf-nr" name="t_numero" className="field" /></div>
            <div><label className="label" htmlFor="nf-cp">Complemento</label><input id="nf-cp" name="t_complemento" className="field" /></div>
            <div><label className="label" htmlFor="nf-br">Bairro</label><input id="nf-br" name="t_bairro" value={addr.bairro} onChange={(e) => setAddr({ ...addr, bairro: e.target.value })} className="field" /></div>
            <div><label className="label" htmlFor="nf-mun">Código IBGE do município</label><input id="nf-mun" name="t_cmun" inputMode="numeric" value={addr.cmun} onChange={(e) => setAddr({ ...addr, cmun: e.target.value })} className="field" /><p className="mt-1 text-xs text-slate-500">{addr.cidade || 'Preenchido pelo "Buscar"'}</p></div>
          </div>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Serviço</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-3"><label className="label" htmlFor="nf-ds">Descrição do serviço (sai na nota)</label><textarea id="nf-ds" name="descricao" rows={3} required maxLength={2000} defaultValue={preset.descricao || cfg.descricao_padrao} className="field" /></div>
          <div><label className="label" htmlFor="nf-v">Valor do serviço (R$)</label><input id="nf-v" name="valor" inputMode="decimal" required defaultValue={preset.valor} placeholder="0,00" className="field" /></div>
          <div><label className="label" htmlFor="nf-d">Desconto incondicional (R$)</label><input id="nf-d" name="desconto" inputMode="decimal" placeholder="0,00" className="field" /></div>
          <div><label className="label" htmlFor="nf-c">Data de competência</label><input id="nf-c" name="competencia" type="date" required defaultValue={preset.competencia} className="field" /><p className="mt-1 text-xs text-slate-500">Dia em que o serviço foi prestado.</p></div>
          <div><label className="label" htmlFor="nf-ctn">Código de tributação nacional</label><input id="nf-ctn" name="c_trib_nac" inputMode="numeric" list="nf-ctn-l" defaultValue={cfg.c_trib_nac} className="field" /><datalist id="nf-ctn-l">{servicos.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</datalist></div>
          <div><label className="label" htmlFor="nf-al">Alíquota do ISS (%)</label><input id="nf-al" name="aliquota" inputMode="decimal" placeholder="Padrão da configuração" className="field" /></div>
          <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" name="iss_retido" /> ISS retido pelo tomador (empresa que retém)</label>
          <div className="sm:col-span-3"><label className="label" htmlFor="nf-inf">Informações complementares (opcional)</label><input id="nf-inf" name="info_compl" maxLength={2000} className="field" placeholder="Ex.: referente à consulta de 20/11" /></div>
        </div>
      </section>
      <div className="flex flex-wrap items-center gap-3"><Btn pending={pending} busy="Enviando para a Sefin...">Emitir nota fiscal</Btn>{s?.id && <Link className="underline" href={`/app/notas/${s.id}`}>Ver a nota</Link>}<Msg s={s} /></div>
    </form>
  );
}

export function CancelForm({ id }: { id: string }) {
  const { state: s, pending, onSubmit } = useKeepForm(cancelInvoice);
  return (
    <form onSubmit={onSubmit} className="card space-y-3">
      <h2 className="font-semibold">Cancelar esta nota</h2>
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div><label className="label" htmlFor="cx-m">Motivo</label><select id="cx-m" name="motivo" className="field"><option value="1">Erro na emissão</option><option value="2">Serviço não prestado</option><option value="9">Outros</option></select></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="cx-t">Explicação (mín. 15 caracteres)</label><input id="cx-t" name="texto" minLength={15} maxLength={255} required className="field" /></div>
      </div>
      <p className="text-xs text-slate-500">Prazo e regras de cancelamento dependem do município. Depois do prazo, a prefeitura pode exigir análise.</p>
      <div className="flex flex-wrap items-center gap-3"><Btn variant="danger" pending={pending} busy="Enviando...">Cancelar nota</Btn><Msg s={s} /></div>
    </form>
  );
}
