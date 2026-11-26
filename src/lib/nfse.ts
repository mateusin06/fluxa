import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import forge from 'node-forge';
import { createDps, serializeDps, validateDps, decimal15v2, decimal1v2, decimal2v2, type DpsInput } from 'nfse-js/core';
import { createPkcs12Signer, signDpsXml, signEventRequestXml } from 'nfse-js/signing';
import { createNodeHttpTransport, createSefinClient, gzipBase64XmlJsonPayload } from 'nfse-js/transport';
import { createEventRequest, serializeEventRequest } from 'nfse-js/events';
import { env } from '@/lib/env';

/**
 * NFS-e no padrão nacional (Sefin Nacional / gov.br), sem intermediário pago:
 * a DPS é montada aqui, assinada com o certificado A1 da clínica e enviada por TLS mútuo.
 * Biblioteca: nfse-js (MIT), leiaute 1.01. Produção restrita = ambiente de testes oficial.
 */

// ------------------------------------------------------------ certificado (cifrado em repouso)
const key = () => createHash('sha256').update('fluxa-nfse:' + (process.env.NFSE_SECRET || env.serviceRole)).digest();

export function sealCert(pfx: Buffer, password: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([c.update(JSON.stringify({ pfx: pfx.toString('base64'), password }), 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), body.toString('base64')].join('.');
}

export function openCert(sealed: string): { pfx: Buffer; password: string } {
  const [v, iv, tag, body] = sealed.split('.');
  if (v !== 'v1') throw new Error('Certificado salvo em formato desconhecido. Envie o certificado de novo.');
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  const j = JSON.parse(Buffer.concat([d.update(Buffer.from(body, 'base64')), d.final()]).toString('utf8'));
  return { pfx: Buffer.from(j.pfx, 'base64'), password: j.password };
}

/** Lê o .pfx: confere a senha e devolve titular, validade e CNPJ/CPF (padrão ICP-Brasil "NOME:documento"). */
export function inspectPfx(pfx: Buffer, password: string) {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.createBuffer(pfx.toString('binary'))), password);
  } catch {
    throw new Error('Não consegui abrir o certificado: confira a senha e se o arquivo é o .pfx (ou .p12) do certificado A1.');
  }
  const bags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
  const keys = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || [];
  const cert = bags.map((b) => b.cert).find(Boolean);
  if (!cert || !keys.length) throw new Error('O arquivo não tem certificado com chave privada. Use o arquivo .pfx do certificado A1.');
  const cnAttr = cert.subject.getField('CN');
  const cn = String(cnAttr?.value || '');
  const doc = (cn.match(/:(\d{14}|\d{11})\b/) || [])[1] || null;
  return { subject: cn, validTo: cert.validity.notAfter.toISOString(), validFrom: cert.validity.notBefore.toISOString(), doc };
}

// ------------------------------------------------------------ validações de documento
export const digits = (s: unknown) => String(s ?? '').replace(/\D/g, '');
export function validCpf(c: string) {
  if (!/^\d{11}$/.test(c) || /^(\d)\1+$/.test(c)) return false;
  const dv = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}
export function validCnpj(c: string) {
  if (!/^\d{14}$/.test(c) || /^(\d)\1+$/.test(c)) return false;
  const dv = (n: number) => { const w = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const s = w.reduce((a, x, i) => a + x * Number(c[i]), 0); const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return dv(12) === Number(c[12]) && dv(13) === Number(c[13]);
}
export const validDoc = (d: string) => (d.length === 11 ? validCpf(d) : d.length === 14 ? validCnpj(d) : false);

// ------------------------------------------------------------ tipos
export interface FiscalConfig {
  clinic_id: string; ambiente: '1' | '2'; documento: string | null; inscricao_municipal: string | null; razao_social: string | null;
  cod_municipio: string | null; uf: string | null; cep: string | null; logradouro: string | null; numero: string | null; complemento: string | null; bairro: string | null;
  fone: string | null; email: string | null; op_simples: '1' | '2' | '3'; reg_ap_trib_sn: string | null; reg_esp_trib: string; p_tot_trib_sn: number | string | null;
  serie: string; ultimo_ndps: number; c_trib_nac: string | null; c_trib_mun: string | null; c_nbs: string | null; descricao_padrao: string | null;
  trib_issqn: string; tp_ret_issqn: string; aliquota: number | string | null;
  cert_pfx_enc: string | null; cert_subject: string | null; cert_valid_to: string | null;
}

export interface Tomador {
  doc: string; nome: string; email?: string | null; fone?: string | null;
  cep?: string | null; cMun?: string | null; logradouro?: string | null; numero?: string | null; complemento?: string | null; bairro?: string | null;
}
export interface Servico {
  descricao: string; cTribNac: string; cTribMun?: string | null; cNBS?: string | null; competencia: string; // AAAA-MM-DD
  valor: number; desconto: number; issRetido: boolean; aliquota?: number | null; infoCompl?: string | null;
}

/** O que falta para emitir (em português, para a tela). */
export function configGaps(c: FiscalConfig | null): string[] {
  if (!c) return ['Preencha a configuração fiscal.'];
  const g: string[] = [];
  if (!c.documento || !validDoc(c.documento)) g.push('CNPJ (ou CPF) da clínica válido');
  if (!c.cod_municipio) g.push('município da clínica (código IBGE; use "Buscar CEP")');
  if (!c.c_trib_nac) g.push('código de tributação nacional do serviço');
  if (c.op_simples === '3' && (c.p_tot_trib_sn === null || c.p_tot_trib_sn === '')) g.push('percentual aproximado de tributos do Simples Nacional');
  if (!c.cert_pfx_enc) g.push('certificado digital A1 (.pfx) e a senha');
  else if (c.cert_valid_to && new Date(c.cert_valid_to).getTime() < Date.now()) g.push('certificado digital válido (o atual venceu)');
  return g;
}

const two = (n: number) => n.toFixed(2);
function nowBr() {
  // 1 minuto para trás: a Sefin rejeita dhEmi "no futuro" quando o relógio do servidor está adiantado
  const d = new Date(Date.now() - 60_000 - 3 * 3600_000);
  return d.toISOString().slice(0, 19) + '-03:00';
}

/** Monta a DPS (Declaração de Prestação de Serviço) no leiaute nacional 1.01. */
export function buildDps(c: FiscalConfig, nDps: number, t: Tomador, s: Servico): DpsInput {
  const docP = digits(c.documento), docT = digits(t.doc);
  const prestId = docP.length === 14 ? { CNPJ: docP } : { CPF: docP };
  const tomaId = docT.length === 14 ? { CNPJ: docT } : { CPF: docT };
  const temEnd = !!(t.cep && t.cMun && t.logradouro && t.numero && t.bairro);
  const pTot = c.p_tot_trib_sn === null || c.p_tot_trib_sn === '' ? null : Number(c.p_tot_trib_sn);
  return {
    infDPS: {
      tpAmb: c.ambiente, dhEmi: nowBr(), verAplic: 'Fluxa-1.0', serie: String(Number(c.serie) || 1), nDPS: String(nDps),
      dCompet: s.competencia, tpEmit: '1', cLocEmi: c.cod_municipio!,
      prest: {
        ...prestId,
        ...(c.inscricao_municipal ? { IM: digits(c.inscricao_municipal) || c.inscricao_municipal } : {}),
        ...(c.fone ? { fone: digits(c.fone).slice(-11) } : {}),
        ...(c.email ? { email: c.email } : {}),
        regTrib: {
          opSimpNac: c.op_simples,
          ...(c.op_simples === '3' ? { regApTribSN: (c.reg_ap_trib_sn || '1') as '1' | '2' | '3' } : {}),
          regEspTrib: c.reg_esp_trib as '0',
        },
      },
      toma: {
        ...tomaId, xNome: t.nome.trim().slice(0, 150),
        ...(temEnd ? { end: { endNac: { cMun: t.cMun!, CEP: digits(t.cep) }, xLgr: t.logradouro!.slice(0, 255), nro: t.numero!.slice(0, 60), ...(t.complemento ? { xCpl: t.complemento.slice(0, 156) } : {}), xBairro: t.bairro!.slice(0, 60) } } : {}),
        ...(t.fone && digits(t.fone).length >= 10 ? { fone: digits(t.fone).slice(-11) } : {}),
        ...(t.email ? { email: t.email.trim().slice(0, 80) } : {}),
      },
      serv: {
        locPrest: { cLocPrestacao: c.cod_municipio! },
        cServ: {
          cTribNac: s.cTribNac, xDescServ: s.descricao.trim().slice(0, 2000),
          ...(s.cTribMun ? { cTribMun: s.cTribMun } : {}), ...(s.cNBS ? { cNBS: s.cNBS } : {}),
        },
        ...(s.infoCompl ? { infoCompl: { xInfComp: s.infoCompl.slice(0, 2000) } } : {}),
      },
      valores: {
        vServPrest: { vServ: decimal15v2(two(s.valor)) },
        ...(s.desconto > 0 ? { vDescCondIncond: { vDescIncond: decimal15v2(two(s.desconto)) } } : {}),
        trib: {
          tribMun: {
            tribISSQN: c.trib_issqn as '1', tpRetISSQN: (s.issRetido ? '2' : '1') as '1' | '2',
            ...(s.aliquota ? { pAliq: decimal1v2(two(s.aliquota)) } : {}),
          },
          totTrib: c.op_simples === '3' && pTot !== null ? { pTotTribSN: decimal2v2(two(pTot)) } : { indTotTrib: '0' },
        },
      },
    },
  } as DpsInput;
}

/** Valida localmente (regras oficiais do Anexo I que a biblioteca conhece). Devolve mensagens. */
export function checkDps(input: DpsInput) {
  const dps = createDps(input);
  const r = validateDps(dps);
  return { dps, issues: r.valid ? [] : r.issues.map((i) => `${i.officialCode || i.code}: ${i.message} (${i.path})`) };
}

// ------------------------------------------------------------ envio
function client(c: FiscalConfig) {
  const { pfx, password } = openCert(c.cert_pfx_enc!);
  // NFSE_SEFIN_URL: só para teste local (servidor simulado); em produção fica vazio e vale o endereço oficial
  const test = process.env.NFSE_SEFIN_URL;
  const transport = createNodeHttpTransport({ tls: { pfx, passphrase: password }, userAgent: 'Fluxa-NFSe/1.0', ...(test ? { allowInsecureLocalhost: true } : {}) });
  return {
    sefin: createSefinClient({
      environment: c.ambiente === '1' ? 'production' : 'restricted-production', transport, timeoutMs: 45_000,
      ...(test ? { endpoints: { sefin: test }, allowInsecureLocalhost: true } : {}),
    }),
    pfx, password,
  };
}

type Json = unknown;
/** Procura erros no JSON de resposta da Sefin (Codigo/Descricao em qualquer nível). */
export function sefinErrors(raw: Json): { codigo: string; descricao: string }[] {
  const out: { codigo: string; descricao: string }[] = [];
  const walk = (v: Json, depth = 0) => {
    if (depth > 6 || v === null || typeof v !== 'object') return;
    if (Array.isArray(v)) { v.forEach((x) => walk(x, depth + 1)); return; }
    const o = v as Record<string, unknown>;
    const cod = o.Codigo ?? o.codigo ?? o.code;
    const desc = o.Descricao ?? o.descricao ?? o.mensagem ?? o.message;
    if ((typeof cod === 'string' || typeof cod === 'number') && typeof desc === 'string') {
      out.push({ codigo: String(cod), descricao: desc + (typeof o.Complemento === 'string' && o.Complemento ? ` (${o.Complemento})` : '') });
    }
    Object.values(o).forEach((x) => walk(x, depth + 1));
  };
  walk(raw);
  return out.slice(0, 20);
}

export interface EmitResult {
  status: 'autorizada' | 'rejeitada' | 'erro';
  chave?: string; numero?: string; xmlNfse?: string; signedXml: string; dpsId: string;
  erros?: { codigo: string; descricao: string }[]; resposta?: Json; httpStatus?: number;
}

export async function emitNfse(c: FiscalConfig, input: DpsInput): Promise<EmitResult> {
  const dps = createDps(input);
  const xml = serializeDps(dps);
  const { sefin, pfx, password } = client(c);
  const signedXml = await signDpsXml(xml, createPkcs12Signer(pfx, { password }));
  const dpsId = dps.infDPS.Id;
  try {
    const r = await sefin.submitDps(gzipBase64XmlJsonPayload(signedXml, 'dpsXmlGZipB64'), { timeoutMs: 45_000 });
    const p = r.payload;
    if (p.kind === 'success') {
      const doc = p.documents.find((d) => d.parsed.kind === 'NFSe');
      const raw = (p.raw && typeof p.raw === 'object' ? p.raw : {}) as Record<string, unknown>;
      if (doc && doc.parsed.kind === 'NFSe') {
        const inf = doc.parsed.document.infNFSe;
        return { status: 'autorizada', chave: String(raw.chaveAcesso || inf.Id.replace(/^NFS/, '')), numero: inf.nNFSe, xmlNfse: doc.parsed.originalXml, signedXml, dpsId, resposta: slim(raw), httpStatus: r.status };
      }
      return { status: 'autorizada', chave: typeof raw.chaveAcesso === 'string' ? raw.chaveAcesso : undefined, signedXml, dpsId, resposta: slim(raw), httpStatus: r.status };
    }
    return { status: 'rejeitada', erros: sefinErrors(p.raw).length ? sefinErrors(p.raw) : [{ codigo: String(r.status), descricao: String(p.originalBody || 'Rejeitada sem detalhe').slice(0, 500) }], signedXml, dpsId, resposta: slim(p.raw), httpStatus: r.status };
  } catch (e) {
    return { status: 'erro', erros: [{ codigo: 'conexao', descricao: friendlyNetError(e) }], signedXml, dpsId };
  }
}

/** Depois de um erro de conexão: a nota pode ter sido gerada. Consulta pela DPS antes de emitir de novo. */
export async function recoverNfse(c: FiscalConfig, dpsId: string) {
  const { sefin } = client(c);
  const ex = await sefin.hasNfseForDps(dpsId);
  if (!ex.exists) return null;
  const k = await sefin.getDpsAccessKey(dpsId);
  const v = k.value as unknown;
  const chave = typeof v === 'string' && /^\d{50}$/.test(v) ? v : (v && typeof v === 'object' ? String((v as Record<string, unknown>).chaveAcesso || '') : '');
  if (!/^\d{50}$/.test(chave)) return null;
  const r = await sefin.getNfse(chave);
  const doc = r.payload.kind === 'success' ? r.payload.documents.find((d) => d.parsed.kind === 'NFSe') : undefined;
  return { chave, numero: doc && doc.parsed.kind === 'NFSe' ? doc.parsed.document.infNFSe.nNFSe : undefined, xmlNfse: doc?.parsed.originalXml };
}

/** Cancelamento (evento e101101). Motivo: 1 erro na emissão, 2 serviço não prestado, 9 outros. */
export async function cancelNfse(c: FiscalConfig, chave: string, cMotivo: '1' | '2' | '9', xMotivo: string) {
  const { sefin, pfx, password } = client(c);
  const doc = digits(c.documento);
  const req = createEventRequest({
    infPedReg: {
      tpAmb: c.ambiente, verAplic: 'Fluxa-1.0', dhEvento: nowBr(),
      autor: doc.length === 14 ? { CNPJAutor: doc } : { CPFAutor: doc },
      chNFSe: chave,
      evento: { code: 'e101101', cMotivo, xMotivo },
    },
  } as Parameters<typeof createEventRequest>[0]);
  const signed = await signEventRequestXml(serializeEventRequest(req), createPkcs12Signer(pfx, { password }));
  try {
    const r = await sefin.registerEvent(chave, gzipBase64XmlJsonPayload(signed, 'pedidoRegistroEventoXmlGZipB64'), { timeoutMs: 45_000 });
    if (r.payload.kind === 'success') return { ok: true as const, resposta: slim(r.payload.raw) };
    return { ok: false as const, erros: sefinErrors(r.payload.raw).length ? sefinErrors(r.payload.raw) : [{ codigo: String(r.status), descricao: String(r.payload.originalBody || '').slice(0, 500) }] };
  } catch (e) {
    return { ok: false as const, erros: [{ codigo: 'conexao', descricao: friendlyNetError(e) }] };
  }
}

function slim(raw: unknown) {
  // não guarda o XML compactado duas vezes
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw ?? null;
  const o = { ...(raw as Record<string, unknown>) };
  for (const k of Object.keys(o)) if (/XmlGZipB64$/i.test(k)) o[k] = '(guardado em xml_nfse)';
  return o;
}

function friendlyNetError(e: unknown) {
  const m = e instanceof Error ? e.message : String(e);
  if (/timeout|aborted/i.test(m)) return 'A Sefin Nacional não respondeu a tempo. A nota pode ter sido gerada: use "Consultar de novo" antes de emitir outra.';
  if (/certificate|ssl|tls|handshake|mac verify|pkcs12/i.test(m)) return `Falha no certificado ao conectar na Sefin: ${m}. Confira se é o A1 da clínica, válido e com a senha certa.`;
  return `Falha de conexão com a Sefin Nacional: ${m}`;
}

/** Códigos de tributação nacional mais comuns em clínicas (confirme com o contador). */
export const SERVICOS_SUGERIDOS: [string, string][] = [
  ['041201', '04.12.01 · Odontologia'],
  ['040101', '04.01.01 · Medicina e biomedicina'],
  ['040801', '04.08.01 · Terapia ocupacional, fisioterapia e fonoaudiologia'],
  ['041001', '04.10.01 · Nutrição'],
  ['041601', '04.16.01 · Psicologia'],
  ['060201', '06.02.01 · Esteticistas, tratamento de pele, depilação e congêneres'],
];
