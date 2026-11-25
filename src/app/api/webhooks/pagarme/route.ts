import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSubscription } from '@/lib/pagarme';
import { applyBillingState } from '@/lib/billing';
import { safeEqual } from '@/lib/apikey';
import { notifyFluxa } from '@/lib/notify';

type Obj = Record<string, unknown>;
const get = (o: unknown, path: string): unknown => path.split('.').reduce<unknown>((a, k) => (a && typeof a === 'object' ? (a as Obj)[k] : undefined), o);

export async function POST(req: Request) {
  // Autenticação básica configurada no painel do Pagar.me
  const expected = 'Basic ' + Buffer.from(`${process.env.PAGARME_WEBHOOK_USER}:${process.env.PAGARME_WEBHOOK_PASSWORD}`).toString('base64');
  if (!process.env.PAGARME_WEBHOOK_PASSWORD || !safeEqual(req.headers.get('authorization') || '', expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const ev = (await req.json().catch(() => null)) as Obj | null;
  if (!ev || typeof ev.type !== 'string') return NextResponse.json({ error: 'payload inválido' }, { status: 400 });
  const type = ev.type as string;
  const eventId = String(ev.id || `${type}:${get(ev, 'data.id')}`);
  const db = createAdminClient();

  const ins = await db.from('billing_events').insert({ provider: 'pagarme', event_id: eventId, event_type: type, payload: ev }).select('id').single();
  if (ins.error) {
    if (ins.error.code === '23505') return NextResponse.json({ ok: true, duplicate: true });
    return NextResponse.json({ error: ins.error.message }, { status: 500 });
  }

  try {
    const data = (ev.data || {}) as Obj;
    const subId = (type.startsWith('subscription.') ? data.id : get(data, 'subscription.id') || get(data, 'invoice.subscription.id') || get(data, 'invoice.subscriptionId')) as string | undefined;
    let clinicId: string | undefined;
    let periodEnd: string | null = null;
    let subStatus = '';
    if (subId) {
      // Nunca confiar só no payload: confirma direto na API.
      const sub = await getSubscription(subId);
      subStatus = sub.status;
      periodEnd = sub.current_cycle?.end_at || sub.next_billing_at || null;
      clinicId = sub.metadata?.clinic_id;
      if (!clinicId) {
        const { data: row } = await db.from('subscriptions').select('clinic_id').eq('subscription_id', subId).maybeSingle();
        clinicId = row?.clinic_id;
      }
    }
    if (!clinicId) {
      await db.from('billing_events').update({ processed_at: new Date().toISOString(), error: 'sem assinatura/clínica' }).eq('id', ins.data.id);
      return NextResponse.json({ ok: true, ignored: true });
    }

    const { data: cl } = await db.from('clinics').select('name').eq('id', clinicId).single();
    const clinica = cl?.name || clinicId;
    if (type === 'invoice.paid' || type === 'charge.paid') {
      await applyBillingState(clinicId, { paid: true, periodEnd, event: type });
      await notifyFluxa('saas_pagamento_ok', { clinic_id: clinicId, clinica });
    } else if (type === 'invoice.payment_failed' || type === 'charge.payment_failed') {
      await applyBillingState(clinicId, { failed: true, event: type });
      await notifyFluxa('saas_pagamento_falhou', { clinic_id: clinicId, clinica });
    } else if (type === 'subscription.canceled' || subStatus === 'canceled') {
      await applyBillingState(clinicId, { canceled: true, event: type });
    } else if (type === 'invoice.created' || type === 'charge.created') {
      const url = (get(data, 'charge.last_transaction.pdf') || get(data, 'charge.last_transaction.url') || get(data, 'last_transaction.pdf') || get(data, 'last_transaction.url') || null) as string | null;
      await applyBillingState(clinicId, { event: type, paymentUrl: url, periodEnd });
    } else {
      await applyBillingState(clinicId, { event: type, periodEnd });
    }
    await db.from('billing_events').update({ processed_at: new Date().toISOString() }).eq('id', ins.data.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    // Apaga o registro para o reenvio do Pagar.me (que recebe 500) ser processado de novo.
    await db.from('billing_events').delete().eq('id', ins.data.id);
    await db.from('audit_log').insert({ action: 'billing.webhook_error', detail: { type, error: (e as Error).message.slice(0, 500) } });
    return NextResponse.json({ error: 'falha ao processar' }, { status: 500 });
  }
}
