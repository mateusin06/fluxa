import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { PRICING } from '@/lib/plans';
import type { SubItem } from '@/lib/pagarme';

export function itemsFor(plan: string, automacoesAtivas: boolean): SubItem[] {
  const items: SubItem[] = [{ description: 'Fluxa — Sistema para clínicas (mensal)', cents: PRICING.sistemaMensal }];
  if (plan === 'sistema_automacoes' || automacoesAtivas) items.push({ description: 'Fluxa — Manutenção das automações (mensal)', cents: PRICING.automacoesMensal });
  return items;
}

/** Aplica o estado de cobrança na clínica. Só roda no servidor com service role. */
export async function applyBillingState(clinicId: string, s: { paid?: boolean; failed?: boolean; canceled?: boolean; periodEnd?: string | null; event: string; paymentUrl?: string | null }) {
  const db = createAdminClient();
  const { data: clinic } = await db.from('clinics').select('status, past_due_since').eq('id', clinicId).single();
  if (!clinic) return;
  const subPatch: Record<string, unknown> = { last_event: s.event, updated_at: new Date().toISOString() };
  if (s.periodEnd) subPatch.current_period_end = s.periodEnd;
  if (s.paymentUrl !== undefined) subPatch.pending_payment_url = s.paymentUrl;
  if (s.paid) {
    subPatch.status = 'active';
    subPatch.pending_payment_url = null;
    await db.from('clinics').update({ status: 'active', past_due_since: null }).eq('id', clinicId);
  } else if (s.failed) {
    subPatch.status = 'past_due';
    if (clinic.status === 'active') await db.from('clinics').update({ status: 'past_due', past_due_since: clinic.past_due_since || new Date().toISOString() }).eq('id', clinicId);
  } else if (s.canceled) {
    subPatch.status = 'canceled';
  }
  await db.from('subscriptions').update(subPatch).eq('clinic_id', clinicId);
  await db.from('audit_log').insert({ clinic_id: clinicId, action: 'billing.' + s.event, detail: s });
}

export const monthlyCents = (plan: string, automacoesAtivas: boolean) =>
  PRICING.sistemaMensal + (plan === 'sistema_automacoes' || automacoesAtivas ? PRICING.automacoesMensal : 0);
