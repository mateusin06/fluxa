import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { CLINIC_COOKIE } from '@/lib/clinic';
import { cancelSubscription } from '@/lib/pagarme';
import { jsonError } from '@/lib/api-ctx';
import { notifyFluxa } from '@/lib/notify';

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError(new Error('Faça login'), 401);
  const cid = (await cookies()).get(CLINIC_COOKIE)?.value;
  const { data: mem } = await supabase.from('memberships').select('role, clinic_id').eq('user_id', user.id);
  const m = (mem || []).find((x) => x.clinic_id === cid) || (mem || [])[0];
  if (!m || m.role !== 'owner') return jsonError(new Error('Apenas o dono pode cancelar'), 403);
  const db = createAdminClient();
  const { data: sub } = await db.from('subscriptions').select('subscription_id, status').eq('clinic_id', m.clinic_id).single();
  if (!sub?.subscription_id || sub.status === 'canceled') return jsonError(new Error('Nenhuma assinatura ativa'), 400);
  try {
    await cancelSubscription(sub.subscription_id);
    await db.from('subscriptions').update({ status: 'canceled', last_event: 'subscription.canceled_by_user', updated_at: new Date().toISOString() }).eq('clinic_id', m.clinic_id);
    await db.from('audit_log').insert({ clinic_id: m.clinic_id, user_id: user.id, action: 'billing.cancel' });
    const { data: cl } = await db.from('clinics').select('name').eq('id', m.clinic_id).single();
    await notifyFluxa('saas_cancelamento', { clinic_id: m.clinic_id, clinica: cl?.name || '' });
    return NextResponse.json({ ok: true });
  } catch (e) { return jsonError(e, 502); }
}
