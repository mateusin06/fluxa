import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface CommissionRow { chargeId: string; paidAt: string; patient: string; description: string; amount: number; pct: number; value: number }
export interface CommissionPro { id: string; name: string; base: number; total: number; rows: CommissionRow[] }

/**
 * Comissão do mês: sobre o que foi RECEBIDO no mês (cobranças pagas), por profissional.
 * Consulta: profissional e procedimento da consulta. Orçamento: profissional do orçamento,
 * com a % média dos itens (cada item pesa pelo seu valor).
 * % = a do procedimento para aquele profissional, senão a padrão do profissional, senão 0.
 */
export async function monthCommissions(db: SupabaseClient, cid: string, startIso: string, endIso: string) {
  const [{ data: pros }, { data: pp }, { data: ch }] = await Promise.all([
    db.from('professionals').select('id, name, commission_pct').eq('clinic_id', cid).order('name'),
    db.from('professional_procedures').select('professional_id, procedure_id, commission_pct').eq('clinic_id', cid),
    db.from('charges').select('id, amount, paid_at, description, contact:contacts(name), appointment:appointments(professional_id, procedure_id), quote:quotes(professional_id, quote_items(procedure_id, qty, unit_price))')
      .eq('clinic_id', cid).eq('status', 'pago').gte('paid_at', startIso).lt('paid_at', endIso).order('paid_at').limit(10000),
  ]);
  const def = new Map((pros || []).map((p) => [p.id as string, p.commission_pct === null ? 0 : Number(p.commission_pct)]));
  const over = new Map((pp || []).filter((x) => x.commission_pct !== null).map((x) => [`${x.professional_id}|${x.procedure_id}`, Number(x.commission_pct)]));
  const pctOf = (pro: string, proc: string | null) => (proc && over.has(`${pro}|${proc}`) ? over.get(`${pro}|${proc}`)! : def.get(pro) ?? 0);

  const by = new Map<string, CommissionPro>((pros || []).map((p) => [p.id as string, { id: p.id as string, name: p.name as string, base: 0, total: 0, rows: [] }]));
  let semProfissional = 0;
  for (const c of ch || []) {
    const ap = c.appointment as unknown as { professional_id: string | null; procedure_id: string | null } | null;
    const q = c.quote as unknown as { professional_id: string | null; quote_items: { procedure_id: string | null; qty: number; unit_price: number }[] } | null;
    const pro = ap?.professional_id || q?.professional_id || null;
    const amount = Number(c.amount);
    if (!pro || !by.has(pro)) { semProfissional += amount; continue; }
    let pct: number;
    if (ap) pct = pctOf(pro, ap.procedure_id);
    else {
      const items = q?.quote_items || [];
      const tot = items.reduce((a, i) => a + i.qty * Number(i.unit_price), 0);
      pct = tot > 0 ? items.reduce((a, i) => a + i.qty * Number(i.unit_price) * pctOf(pro, i.procedure_id), 0) / tot : pctOf(pro, null);
    }
    const value = Math.round(amount * pct) / 100;
    const g = by.get(pro)!;
    g.base += amount; g.total += value;
    g.rows.push({ chargeId: c.id as string, paidAt: c.paid_at as string, patient: (c.contact as unknown as { name: string } | null)?.name || '', description: (c.description as string) || '', amount, pct: Math.round(pct * 100) / 100, value });
  }
  const list = [...by.values()].filter((g) => g.rows.length).map((g) => ({ ...g, total: Math.round(g.total * 100) / 100 }));
  return { list, semProfissional: Math.round(semProfissional * 100) / 100 };
}
