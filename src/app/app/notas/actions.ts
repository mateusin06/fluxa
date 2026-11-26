'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getContext } from '@/lib/clinic';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseMoney } from '@/lib/payments';
import { buildDps, cancelNfse, checkDps, configGaps, digits, emitNfse, inspectPfx, recoverNfse, sealCert, validDoc, type FiscalConfig } from '@/lib/nfse';

type S = { error?: string; ok?: string; id?: string } | null;
const txt = (fd: FormData, k: string, max = 200) => String(fd.get(k) ?? '').trim().slice(0, max) || null;

async function admin() {
  const ctx = await getContext();
  if (!ctx.isAdmin) throw new Error('Só o dono ou um administrador emite notas fiscais.');
  return ctx;
}
async function loadConfig(cid: string) {
  const { data } = await createAdminClient().from('nfse_config').select('*').eq('clinic_id', cid).maybeSingle();
  return data as FiscalConfig | null;
}

/** Configuração fiscal da clínica (prestador) e certificado A1. */
export async function saveFiscalConfig(_: S, fd: FormData): Promise<S> {
  try {
    const { clinic, user } = await admin();
    const db = createAdminClient();
    const documento = digits(fd.get('documento'));
    if (documento && !validDoc(documento)) return { error: 'CNPJ/CPF da clínica inválido (confira os dígitos).' };
    const op = z.enum(['1', '2', '3']).catch('3').parse(fd.get('op_simples'));
    const pTot = parseMoney(fd.get('p_tot_trib_sn'));
    if (Number.isNaN(pTot) || (pTot !== null && pTot >= 100)) return { error: 'Percentual de tributos inválido. Ex.: 6,00' };
    const aliq = parseMoney(fd.get('aliquota'));
    if (Number.isNaN(aliq) || (aliq !== null && aliq >= 10)) return { error: 'Alíquota do ISS inválida (de 0 a 9,99%).' };
    const cTribNac = digits(fd.get('c_trib_nac'));
    if (cTribNac && cTribNac.length !== 6) return { error: 'O código de tributação nacional tem 6 dígitos (ex.: 041201 para odontologia).' };
    const cTribMun = digits(fd.get('c_trib_mun'));
    if (cTribMun && cTribMun.length !== 3) return { error: 'O código de tributação municipal tem 3 dígitos (deixe vazio se a prefeitura não usa).' };
    const cNbs = digits(fd.get('c_nbs'));
    if (cNbs && cNbs.length !== 9) return { error: 'O código NBS tem 9 dígitos (deixe vazio se não souber).' };
    const cMun = digits(fd.get('cod_municipio'));
    if (cMun && cMun.length !== 7) return { error: 'O código IBGE do município tem 7 dígitos. Use "Buscar CEP".' };
    const cep = digits(fd.get('cep'));
    const serie = digits(fd.get('serie')) || '1';
    const ultimo = Math.max(0, Math.floor(Number(digits(fd.get('ultimo_ndps')) || 0)));

    const row: Record<string, unknown> = {
      clinic_id: clinic.id, ambiente: fd.get('ambiente') === '1' ? '1' : '2',
      documento: documento || null, inscricao_municipal: txt(fd, 'inscricao_municipal', 15), razao_social: txt(fd, 'razao_social', 150),
      cod_municipio: cMun || null, uf: (txt(fd, 'uf', 2) || '').toUpperCase() || null, cep: cep.length === 8 ? cep : null,
      logradouro: txt(fd, 'logradouro', 255), numero: txt(fd, 'numero', 60), complemento: txt(fd, 'complemento', 156), bairro: txt(fd, 'bairro', 60),
      fone: digits(fd.get('fone')) || null, email: txt(fd, 'email', 80),
      op_simples: op, reg_ap_trib_sn: op === '3' ? z.enum(['1', '2', '3']).catch('1').parse(fd.get('reg_ap_trib_sn')) : null,
      reg_esp_trib: z.enum(['0', '1', '2', '3', '4', '5', '6', '9']).catch('0').parse(fd.get('reg_esp_trib')),
      p_tot_trib_sn: pTot, serie: serie.slice(0, 5), c_trib_nac: cTribNac || null, c_trib_mun: cTribMun || null, c_nbs: cNbs || null,
      descricao_padrao: txt(fd, 'descricao_padrao', 1000),
      trib_issqn: z.enum(['1', '2', '3', '4']).catch('1').parse(fd.get('trib_issqn')),
      tp_ret_issqn: '1', aliquota: aliq, updated_by: user.id, updated_at: new Date().toISOString(),
    };
    // número: só deixa aumentar (para continuar a numeração de outro emissor), nunca voltar
    const cur = await loadConfig(clinic.id);
    if (!cur || ultimo > Number(cur.ultimo_ndps || 0)) row.ultimo_ndps = ultimo;

    const file = fd.get('cert');
    let certMsg = '';
    if (file instanceof File && file.size > 0) {
      if (file.size > 50_000) return { error: 'Arquivo grande demais para um certificado A1 (.pfx).' };
      const pass = String(fd.get('cert_password') || '');
      if (!pass) return { error: 'Informe a senha do certificado.' };
      const buf = Buffer.from(await file.arrayBuffer());
      const info = inspectPfx(buf, pass);
      if (new Date(info.validTo).getTime() < Date.now()) return { error: `Esse certificado venceu em ${new Date(info.validTo).toLocaleDateString('pt-BR')}.` };
      const doc = documento || cur?.documento || '';
      if (info.doc && doc && info.doc !== doc) return { error: `O certificado é do documento ${info.doc}, diferente do CNPJ/CPF informado (${doc}). A nota precisa ser assinada pelo próprio prestador.` };
      row.cert_pfx_enc = sealCert(buf, pass);
      row.cert_subject = info.subject.slice(0, 200);
      row.cert_valid_to = info.validTo;
      if (!documento && info.doc) row.documento = info.doc;
      certMsg = ` Certificado de ${info.subject} válido até ${new Date(info.validTo).toLocaleDateString('pt-BR')}.`;
    }
    const { error } = await db.from('nfse_config').upsert(row, { onConflict: 'clinic_id' });
    if (error) return { error: error.message };
    revalidatePath('/app/notas');
    return { ok: 'Configuração salva.' + certMsg };
  } catch (e) { return { error: (e as Error).message }; }
}

/** Emite a NFS-e (DPS → Sefin Nacional). */
export async function emitInvoice(_: S, fd: FormData): Promise<S> {
  try {
    const { clinic, user } = await admin();
    const db = createAdminClient();
    const cfg = await loadConfig(clinic.id);
    const gaps = configGaps(cfg);
    if (gaps.length) return { error: 'Antes de emitir, complete a configuração fiscal: ' + gaps.join(', ') + '.' };
    const c = cfg!;

    const doc = digits(fd.get('t_doc'));
    if (!validDoc(doc)) return { error: 'CPF ou CNPJ do tomador (quem recebe a nota) inválido.' };
    const nome = txt(fd, 't_nome', 150);
    if (!nome) return { error: 'Informe o nome de quem recebe a nota.' };
    const valor = parseMoney(fd.get('valor'));
    if (valor === null || Number.isNaN(valor) || valor <= 0) return { error: 'Informe o valor do serviço.' };
    const desconto = parseMoney(fd.get('desconto')) || 0;
    if (Number.isNaN(desconto) || desconto >= valor) return { error: 'O desconto precisa ser menor que o valor do serviço.' };
    const descricao = txt(fd, 'descricao', 2000);
    if (!descricao) return { error: 'Descreva o serviço prestado.' };
    const comp = String(fd.get('competencia') || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(comp)) return { error: 'Data de competência inválida.' };
    const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
    if (comp > hoje) return { error: 'A competência não pode ser uma data futura.' };
    const cTribNac = digits(fd.get('c_trib_nac')) || c.c_trib_nac!;
    if (cTribNac.length !== 6) return { error: 'Código de tributação nacional: 6 dígitos.' };
    const aliq = parseMoney(fd.get('aliquota'));
    const cep = digits(fd.get('t_cep'));
    const cMun = digits(fd.get('t_cmun'));
    const tomador = {
      doc, nome, email: txt(fd, 't_email', 80), fone: txt(fd, 't_fone', 20),
      cep: cep.length === 8 ? cep : null, cMun: cMun.length === 7 ? cMun : null,
      logradouro: txt(fd, 't_logradouro', 255), numero: txt(fd, 't_numero', 60), complemento: txt(fd, 't_complemento', 156), bairro: txt(fd, 't_bairro', 60),
    };
    if (tomador.cep && (!tomador.cMun || !tomador.logradouro || !tomador.numero || !tomador.bairro)) return { error: 'Endereço do tomador incompleto: com CEP, informe também rua, número e bairro (use "Buscar CEP").' };
    const servico = {
      descricao, cTribNac, cTribMun: digits(fd.get('c_trib_mun')) || c.c_trib_mun, cNBS: digits(fd.get('c_nbs')) || c.c_nbs,
      competencia: comp, valor, desconto, issRetido: fd.get('iss_retido') === 'on',
      aliquota: aliq && !Number.isNaN(aliq) ? aliq : (c.aliquota ? Number(c.aliquota) : null), infoCompl: txt(fd, 'info_compl', 2000),
    };

    // 1) confere as regras oficiais antes de gastar um número
    const pre = checkDps(buildDps(c, 1, tomador, servico));
    if (pre.issues.length) return { error: 'A nota tem dados que a Sefin vai recusar:\n• ' + pre.issues.join('\n• ') };

    // 2) reserva o número e grava como "processando"
    const { data: n, error: ne } = await db.rpc('next_dps_number', { cid: clinic.id });
    if (ne || !n) return { error: 'Não consegui reservar o número da nota: ' + (ne?.message || 'configuração não encontrada') };
    const input = buildDps(c, Number(n), tomador, servico);
    const chargeId = z.string().uuid().safeParse(fd.get('charge_id'));
    const contactId = z.string().uuid().safeParse(fd.get('contact_id'));
    const { data: row, error: ie } = await db.from('nfse').insert({
      clinic_id: clinic.id, ambiente: c.ambiente, serie: input.infDPS.serie, n_dps: Number(n), status: 'processando',
      charge_id: chargeId.success ? chargeId.data : null, contact_id: contactId.success ? contactId.data : null,
      competencia: comp, valor, desconto, descricao, tomador, servico, created_by: user.id,
    }).select('id').single();
    if (ie) return { error: ie.message };

    // 3) assina e envia
    const r = await emitNfse(c, input);
    await db.from('nfse').update({
      status: r.status, dps_id: r.dpsId, xml_dps: r.signedXml, chave_acesso: r.chave || null, numero: r.numero || null, xml_nfse: r.xmlNfse || null,
      erros: r.erros || null, resposta: (r.resposta as object) ?? null, updated_at: new Date().toISOString(),
    }).eq('id', row.id);
    revalidatePath('/app/notas');
    if (r.status === 'autorizada') return { ok: `Nota emitida${r.numero ? ` (nº ${r.numero})` : ''}${c.ambiente === '2' ? ' no ambiente de TESTE (produção restrita): não vale como nota real' : ''}.`, id: row.id };
    if (r.status === 'rejeitada') return { error: 'A Sefin recusou a nota:\n• ' + (r.erros || []).map((e) => `${e.codigo}: ${e.descricao}`).join('\n• '), id: row.id };
    return { error: (r.erros || []).map((e) => e.descricao).join(' ') + ' Veja em Notas emitidas.', id: row.id };
  } catch (e) { return { error: (e as Error).message }; }
}

/** Depois de erro de conexão: pergunta à Sefin se a nota saiu. */
export async function recheckInvoice(fd: FormData) {
  const { clinic } = await admin();
  const db = createAdminClient();
  const id = z.string().uuid().parse(fd.get('id'));
  const { data: nf } = await db.from('nfse').select('id, dps_id, status').eq('id', id).eq('clinic_id', clinic.id).maybeSingle();
  const cfg = await loadConfig(clinic.id);
  if (!nf?.dps_id || !cfg || !['erro', 'processando'].includes(nf.status)) return;
  try {
    const r = await recoverNfse(cfg, nf.dps_id);
    if (r) await db.from('nfse').update({ status: 'autorizada', chave_acesso: r.chave, numero: r.numero || null, xml_nfse: r.xmlNfse || null, erros: null, updated_at: new Date().toISOString() }).eq('id', id);
    else await db.from('nfse').update({ status: 'rejeitada', erros: [{ codigo: 'nao_gerada', descricao: 'A Sefin informou que essa DPS não gerou nota. Pode emitir de novo.' }], updated_at: new Date().toISOString() }).eq('id', id);
  } catch (e) {
    await db.from('nfse').update({ erros: [{ codigo: 'conexao', descricao: (e as Error).message }], updated_at: new Date().toISOString() }).eq('id', id);
  }
  revalidatePath('/app/notas'); revalidatePath(`/app/notas/${id}`);
}

/** Cancelamento da NFS-e (evento e101101). */
export async function cancelInvoice(_: S, fd: FormData): Promise<S> {
  try {
    const { clinic } = await admin();
    const db = createAdminClient();
    const id = z.string().uuid().parse(fd.get('id'));
    const motivo = z.enum(['1', '2', '9']).catch('1').parse(fd.get('motivo'));
    const texto = String(fd.get('texto') || '').trim();
    if (texto.length < 15) return { error: 'Explique o motivo com pelo menos 15 caracteres (exigência da Sefin).' };
    const { data: nf } = await db.from('nfse').select('id, chave_acesso, status').eq('id', id).eq('clinic_id', clinic.id).maybeSingle();
    if (!nf || nf.status !== 'autorizada' || !nf.chave_acesso) return { error: 'Só notas autorizadas podem ser canceladas.' };
    const cfg = await loadConfig(clinic.id);
    if (!cfg?.cert_pfx_enc) return { error: 'Configure o certificado antes de cancelar.' };
    const r = await cancelNfse(cfg, nf.chave_acesso, motivo, texto.slice(0, 255));
    if (!r.ok) return { error: 'A Sefin recusou o cancelamento:\n• ' + r.erros.map((e) => `${e.codigo}: ${e.descricao}`).join('\n• ') };
    await db.from('nfse').update({ status: 'cancelada', cancel_motivo: texto.slice(0, 255), updated_at: new Date().toISOString() }).eq('id', id);
    revalidatePath('/app/notas'); revalidatePath(`/app/notas/${id}`);
    return { ok: 'Nota cancelada.' };
  } catch (e) { return { error: (e as Error).message }; }
}
