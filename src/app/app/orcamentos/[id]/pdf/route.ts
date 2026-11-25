import { getContext } from '@/lib/clinic';
import { brl, clinicHeader, pdfResponse, Writer } from '@/lib/pdf';

const dShort = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

// PDF do orçamento / plano de tratamento para enviar ao paciente
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Orçamento não encontrado', { status: 404 });
  const { supabase, clinic } = await getContext();
  const { data: q } = await supabase.from('quotes').select('id, number, status, discount, notes, valid_until, created_at, contact:contacts(name, phone, document), professional:professionals(name, registration)').eq('id', id).eq('clinic_id', clinic.id).maybeSingle();
  if (!q) return new Response('Orçamento não encontrado', { status: 404 });
  const { data: items } = await supabase.from('quote_items').select('description, region, qty, unit_price').eq('quote_id', id).order('position');
  const pac = q.contact as unknown as { name: string; phone: string | null; document: string | null };
  const pro = q.professional as unknown as { name: string; registration: string | null } | null;
  const sub = (items || []).reduce((a, i) => a + i.qty * Number(i.unit_price), 0);
  const total = Math.max(0, sub - Number(q.discount));

  const w = await Writer.create();
  await clinicHeader(w, supabase, clinic);
  w.text(`ORÇAMENTO Nº ${q.number}`, { size: 15, bold: true });
  w.text(`Paciente: ${pac.name}${pac.document ? ` · CPF ${pac.document}` : ''}`, { size: 10 });
  w.text(`Emitido em ${dShort(q.created_at)}${q.valid_until ? ` · válido até ${dShort(q.valid_until + 'T12:00:00-03:00')}` : ''}${pro ? ` · ${pro.name}${pro.registration ? ` (${pro.registration})` : ''}` : ''}`, { size: 10, color: [0.35, 0.38, 0.45], gap: 6 });
  w.hr(6);

  const X = { d: w.M, r: 310, q: 390, u: 430, s: 495 };
  w.row([['Procedimento', X.d, 255, 'left', true], [clinic.kind === 'odonto' ? 'Dente/região' : 'Região', X.r, 75, 'left', true], ['Sessões', X.q, 40, 'right', true], ['Valor unit.', X.u, 60, 'right', true], ['Subtotal', X.s, w.W - w.M - X.s, 'right', true]], 9);
  w.hr(3);
  for (const i of items || []) {
    w.row([[i.description, X.d, 255], [i.region || '', X.r, 75], [String(i.qty), X.q, 40, 'right'], [brl(Number(i.unit_price)), X.u, 60, 'right'], [brl(i.qty * Number(i.unit_price)), X.s, w.W - w.M - X.s, 'right']], 9);
    w.space(3);
  }
  w.hr(4);
  const right = (label: string, v: string, bold = false, size = 10) => w.row([[label, 300, 140, 'right', bold], [v, 445, w.W - w.M - 445, 'right', bold]], size);
  if (Number(q.discount) > 0) { right('Subtotal', brl(sub)); right('Desconto', '- ' + brl(Number(q.discount))); }
  right('Total', brl(total), true, 13);
  w.space(14);
  if (q.notes) { w.text('Observações', { bold: true, size: 10 }); w.text(q.notes, { size: 10, gap: 10 }); }
  w.text('Valores sujeitos a avaliação clínica. O plano pode ser ajustado conforme a evolução do tratamento. Formas de pagamento: Pix, cartão (débito ou crédito parcelado) e demais condições combinadas com a clínica.', { size: 8, color: [0.45, 0.47, 0.52], gap: 40 });
  w.text('______________________________________________', { align: 'center' });
  w.text(pro ? `${pro.name}${pro.registration ? ` · ${pro.registration}` : ''}` : clinic.responsible_name ? `${clinic.responsible_name}${clinic.responsible_reg ? ` · ${clinic.responsible_reg}` : ''}` : clinic.name, { align: 'center', bold: true, size: 10 });
  return pdfResponse(await w.save(), `orcamento-${q.number}.pdf`);
}
