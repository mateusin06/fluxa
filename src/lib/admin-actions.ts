import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { addSubscriptionItem } from '@/lib/pagarme';
import { PRICING } from '@/lib/plans';

export type AdminAction = 'ativar_manual' | 'bloquear' | 'desbloquear' | 'estender_teste' | 'automacao_instalando' | 'automacao_ativa' | 'automacao_cancelada';

/** Ações de controle do SaaS (painel admin e sistema interno). */
export async function runAdminAction(clinicId: string, action: AdminAction, by: string) {
  const db = createAdminClient();
  const now = new Date();
  switch (action) {
    case 'ativar_manual':
      await db.from('clinics').update({ status: 'active', past_due_since: null }).eq('id', clinicId);
      await db.from('subscriptions').update({ provider: 'manual', status: 'active', current_period_end: new Date(now.getTime() + 31 * 86400000).toISOString() }).eq('clinic_id', clinicId);
      break;
    case 'bloquear':
      await db.from('clinics').update({ status: 'blocked' }).eq('id', clinicId);
      break;
    case 'desbloquear':
      await db.from('clinics').update({ status: 'trial', trial_ends_at: new Date(now.getTime() + 3 * 86400000).toISOString() }).eq('id', clinicId);
      break;
    case 'estender_teste': {
      const { data: c } = await db.from('clinics').select('trial_ends_at, status').eq('id', clinicId).single();
      const base = Math.max(now.getTime(), new Date(c?.trial_ends_at || now).getTime());
      await db.from('clinics').update({ status: c?.status === 'active' ? 'active' : 'trial', trial_ends_at: new Date(base + 7 * 86400000).toISOString() }).eq('id', clinicId);
      break;
    }
    case 'automacao_instalando':
    case 'automacao_ativa':
    case 'automacao_cancelada': {
      const status = action === 'automacao_ativa' ? 'ativo' : action === 'automacao_instalando' ? 'em_instalacao' : 'cancelado';
      const { data: req } = await db.from('automation_requests').select('id').eq('clinic_id', clinicId).neq('status', 'cancelado').order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (req) await db.from('automation_requests').update({ status }).eq('id', req.id);
      else await db.from('automation_requests').insert({ clinic_id: clinicId, status, notes: 'Criado pelo admin' });
      if (action === 'automacao_ativa') {
        await db.from('clinics').update({ plan: 'sistema_automacoes' }).eq('id', clinicId);
        const { data: sub } = await db.from('subscriptions').select('subscription_id, status, provider').eq('clinic_id', clinicId).single();
        if (sub?.subscription_id && sub.provider === 'pagarme' && sub.status !== 'canceled') {
          await addSubscriptionItem(sub.subscription_id, { description: 'Fluxa — Manutenção das automações (mensal)', cents: PRICING.automacoesMensal });
          await db.from('subscriptions').update({ amount_cents: PRICING.sistemaMensal + PRICING.automacoesMensal }).eq('clinic_id', clinicId);
        }
      }
      if (action === 'automacao_cancelada') await db.from('clinics').update({ plan: 'sistema' }).eq('id', clinicId);
      break;
    }
  }
  await db.from('audit_log').insert({ clinic_id: clinicId, action: 'admin.' + action, detail: { by } });
}
