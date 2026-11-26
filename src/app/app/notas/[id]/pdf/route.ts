import { getContext } from '@/lib/clinic';
import { createAdminClient } from '@/lib/supabase/admin';
import { brl, pdfResponse, Writer } from '@/lib/pdf';

const fmtDoc = (d: string) => d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
const dShort = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });

// Documento auxiliar da NFS-e (resumo para o paciente). O documento fiscal é o XML autorizado pela Sefin Nacional.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Não encontrada', { status: 404 });
  const { supabase, clinic, isAdmin } = await getContext();
  if (!isAdmin) return new Response('Sem permissão', { status: 403 });
  const { data: n } = await supabase.from('nfse').select('*').eq('id', id).eq('clinic_id', clinic.id).maybeSingle();
  if (!n || !['autorizada', 'cancelada'].includes(n.status)) return new Response('Só notas autorizadas têm PDF.', { status: 409 });
  const { data: cfg } = await createAdminClient().from('nfse_config').select('documento, inscricao_municipal, razao_social, logradouro, numero, bairro, uf, email, fone').eq('clinic_id', clinic.id).maybeSingle();
  const t = n.tomador as { doc: string; nome: string; email?: string | null; logradouro?: string | null; numero?: string | null; bairro?: string | null };
  const sv = n.servico as { cTribNac: string; issRetido?: boolean; aliquota?: number | null };
  const valor = Number(n.valor), desc = Number(n.desconto);

  const w = await Writer.create();
  w.text('DANFSe · Documento Auxiliar da NFS-e', { size: 15, bold: true, align: 'center' });
  if (n.ambiente === '2') w.text('AMBIENTE DE TESTE (PRODUÇÃO RESTRITA) · SEM VALOR FISCAL', { size: 10, bold: true, align: 'center', color: [0.75, 0.1, 0.1] });
  if (n.status === 'cancelada') w.text('NOTA CANCELADA', { size: 12, bold: true, align: 'center', color: [0.75, 0.1, 0.1] });
  w.space(6);
  w.row([[`Número da NFS-e: ${n.numero || '-'}`, w.M, 250, 'left', true], [`DPS: série ${n.serie} nº ${n.n_dps}`, w.M + 260, 235, 'right', false]], 10);
  w.text(`Chave de acesso: ${n.chave_acesso || '-'}`, { size: 9 });
  w.text(`Emitida em ${dShort(n.created_at)} · Competência ${new Date(n.competencia + 'T12:00:00Z').toLocaleDateString('pt-BR')}`, { size: 9, gap: 4 });
  w.hr(6);
  w.text('PRESTADOR DO SERVIÇO', { size: 9, bold: true, color: [0.35, 0.38, 0.45] });
  w.text(cfg?.razao_social || clinic.name, { size: 11, bold: true });
  w.text([cfg?.documento ? `CNPJ/CPF ${fmtDoc(cfg.documento)}` : '', cfg?.inscricao_municipal ? `IM ${cfg.inscricao_municipal}` : ''].filter(Boolean).join(' · '), { size: 9 });
  w.text([cfg?.logradouro, cfg?.numero, cfg?.bairro, clinic.city, cfg?.uf].filter(Boolean).join(', '), { size: 9 });
  w.hr(6);
  w.text('TOMADOR DO SERVIÇO', { size: 9, bold: true, color: [0.35, 0.38, 0.45] });
  w.text(t.nome, { size: 11, bold: true });
  w.text([`CPF/CNPJ ${fmtDoc(t.doc)}`, t.email || ''].filter(Boolean).join(' · '), { size: 9 });
  if (t.logradouro) w.text([t.logradouro, t.numero, t.bairro].filter(Boolean).join(', '), { size: 9 });
  w.hr(6);
  w.text('DISCRIMINAÇÃO DO SERVIÇO', { size: 9, bold: true, color: [0.35, 0.38, 0.45] });
  w.text(n.descricao, { size: 10 });
  w.text(`Código de tributação nacional: ${sv.cTribNac}`, { size: 9, gap: 4 });
  w.hr(6);
  w.text('VALORES', { size: 9, bold: true, color: [0.35, 0.38, 0.45] });
  w.text(`Valor do serviço: ${brl(valor)}`, { size: 10 });
  if (desc > 0) w.text(`Desconto incondicional: ${brl(desc)}`, { size: 10 });
  w.text(`Valor líquido: ${brl(valor - desc)}`, { size: 12, bold: true });
  w.text(`ISS ${sv.issRetido ? 'retido pelo tomador' : 'não retido'}${sv.aliquota ? ` · alíquota ${sv.aliquota}%` : ''}`, { size: 9, gap: 10 });
  w.hr(6);
  w.text('Este é um resumo da NFS-e emitida no Sistema Nacional (Receita Federal / gov.br). Confira a autenticidade com a chave de acesso em www.nfse.gov.br/consultapublica. O documento fiscal válido é o XML autorizado.', { size: 8, color: [0.35, 0.38, 0.45] });
  return pdfResponse(await w.doc.save(), `nfse-${n.numero || n.n_dps}.pdf`);
}
