import { getContext } from '@/lib/clinic';
import { methodLabel } from '@/lib/payments';
import { brl, clinicHeader, extenso, pdfResponse, Writer } from '@/lib/pdf';

const dLong = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });
const dShort = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

// Recibo de pagamento (PDF) de uma cobrança paga — serve para reembolso do convênio e imposto de renda.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Recibo não encontrado', { status: 404 });
  const { supabase, clinic } = await getContext();
  const { data: c } = await supabase.from('charges')
    .select('id, amount, description, status, paid_at, payment_method, installments, sheet_row, contact:contacts(name, document), appointment:appointments(starts_at, professional:professionals(name, registration)), quote:quotes(number, professional:professionals(name, registration))')
    .eq('id', id).eq('clinic_id', clinic.id).maybeSingle();
  if (!c) return new Response('Recibo não encontrado', { status: 404 });
  if (c.status !== 'pago' || !c.paid_at) return new Response('Só cobranças pagas têm recibo.', { status: 409 });

  const pac = c.contact as unknown as { name: string; document: string | null } | null;
  const ap = c.appointment as unknown as { starts_at: string; professional: { name: string; registration: string | null } | null } | null;
  const qt = c.quote as unknown as { number: number; professional: { name: string; registration: string | null } | null } | null;
  const prof = ap?.professional || qt?.professional || null;
  const amount = Number(c.amount);

  const w = await Writer.create();
  await clinicHeader(w, supabase, clinic);
  w.space(10);
  w.text(`RECIBO Nº ${c.sheet_row ?? ''}`, { size: 16, bold: true, align: 'center' });
  w.text(brl(amount), { size: 14, bold: true, align: 'center', gap: 18 });
  const ref = [c.description || 'Atendimento', ap ? `realizado em ${dShort(ap.starts_at)}` : '', prof ? `por ${prof.name}${prof.registration ? ` (${prof.registration})` : ''}` : ''].filter(Boolean).join(', ');
  w.text(`Recebemos de ${pac?.name || 'paciente'}${pac?.document ? `, CPF ${pac.document},` : ''} a importância de ${brl(amount)} (${extenso(amount)}), referente a ${ref}.`, { size: 11, gap: 10 });
  const forma = methodLabel(c.payment_method) || 'não informada';
  w.text(`Forma de pagamento: ${forma}${c.payment_method === 'credito' && c.installments > 1 ? ` em ${c.installments}x` : ''}. Pago em ${dShort(c.paid_at)}.`, { size: 11, gap: 10 });
  w.text('Para clareza, firmamos o presente recibo, dando plena quitação do valor acima.', { size: 11, gap: 30 });
  w.text(`${clinic.city ? clinic.city + ', ' : ''}${dLong(c.paid_at)}.`, { size: 11, gap: 60 });
  w.text('______________________________________________', { align: 'center' });
  const resp = prof || (clinic.responsible_name ? { name: clinic.responsible_name, registration: clinic.responsible_reg } : null);
  w.text(resp ? `${resp.name}${resp.registration ? ` · ${resp.registration}` : ''}` : clinic.name, { align: 'center', bold: true });
  w.text(clinic.name + (clinic.document ? ` · CNPJ/CPF ${clinic.document}` : ''), { align: 'center', size: 9, color: [0.35, 0.38, 0.45] });
  if (!pac?.document) {
    w.space(30);
    w.text('Para reembolso do convênio ou declaração do imposto de renda, cadastre o CPF do paciente na ficha dele e gere o recibo de novo.', { size: 8, color: [0.5, 0.5, 0.5] });
  }
  return pdfResponse(await w.save(), `recibo-${c.sheet_row ?? c.id}.pdf`);
}
