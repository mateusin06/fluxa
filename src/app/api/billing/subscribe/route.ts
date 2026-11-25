import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { cookies } from 'next/headers';
import { CLINIC_COOKIE } from '@/lib/clinic';
import { createCustomer, createSubscription, cancelSubscription } from '@/lib/pagarme';
import { itemsFor } from '@/lib/billing';
import { jsonError } from '@/lib/api-ctx';
import { notifyFluxa } from '@/lib/notify';

// Assinatura pode ser feita mesmo com a clínica bloqueada (é justamente para desbloquear).
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError(new Error('Faça login'), 401);
  const cid = (await cookies()).get(CLINIC_COOKIE)?.value;
  const { data: mem } = await supabase.from('memberships').select('role, clinic_id').eq('user_id', user.id).order('created_at');
  const m = (mem || []).find((x) => x.clinic_id === cid) || (mem || [])[0];
  if (!m || !['owner', 'admin'].includes(m.role)) return jsonError(new Error('Apenas dono ou administrador'), 403);

  const b = z.object({
    method: z.enum(['credit_card', 'boleto']),
    cardToken: z.string().min(5).optional(),
    name: z.string().trim().min(3).max(120),
    email: z.string().email(),
    document: z.string().transform((s) => s.replace(/\D/g, '')).refine((s) => s.length === 11 || s.length === 14, 'CPF ou CNPJ inválido'),
    phone: z.string().transform((s) => s.replace(/\D/g, '')).refine((s) => s.length >= 10, 'Telefone inválido'),
    zip: z.string().transform((s) => s.replace(/\D/g, '')).refine((s) => s.length === 8, 'CEP inválido'),
    line1: z.string().trim().min(3).max(200),
    city: z.string().trim().min(2).max(80),
    state: z.string().trim().length(2),
  }).safeParse(await req.json().catch(() => ({})));
  if (!b.success) return jsonError(new Error(b.error.issues[0].message), 400);
  if (b.data.method === 'credit_card' && !b.data.cardToken) return jsonError(new Error('Dados do cartão ausentes'), 400);

  const db = createAdminClient();
  const [{ data: clinic }, { data: sub }, { data: auto }] = await Promise.all([
    db.from('clinics').select('id, name, plan').eq('id', m.clinic_id).single(),
    db.from('subscriptions').select('*').eq('clinic_id', m.clinic_id).maybeSingle(),
    db.from('automation_requests').select('id').eq('clinic_id', m.clinic_id).eq('status', 'ativo').limit(1),
  ]);
  if (!clinic) return jsonError(new Error('Clínica não encontrada'), 404);
  if (sub?.subscription_id && ['active', 'pending_payment'].includes(sub.status)) return jsonError(new Error('Já existe uma assinatura ativa. Para trocar a forma de pagamento, cancele e assine de novo.'), 409);

  try {
    const customerId = sub?.customer_id || (await createCustomer({
      name: b.data.name, email: b.data.email, document: b.data.document, phone: b.data.phone,
      address: { zip: b.data.zip, line1: b.data.line1, city: b.data.city, state: b.data.state.toUpperCase() },
    }, clinic.id)).id;
    if (sub?.subscription_id && sub.status !== 'canceled') await cancelSubscription(sub.subscription_id).catch(() => null);
    const items = itemsFor(clinic.plan, !!auto?.length);
    const created = await createSubscription({ customerId, clinicId: clinic.id, method: b.data.method, cardToken: b.data.cardToken, items });
    await db.from('subscriptions').upsert({
      clinic_id: clinic.id, provider: 'pagarme', customer_id: customerId, subscription_id: created.id, payment_method: b.data.method,
      amount_cents: items.reduce((a, i) => a + i.cents, 0), status: 'pending_payment', last_event: 'subscription.created', updated_at: new Date().toISOString(),
    });
    await notifyFluxa('saas_assinatura_criada', { clinica: clinic.name, clinic_id: clinic.id, metodo: b.data.method });
    return NextResponse.json({ ok: true, status: created.status });
  } catch (e) {
    return jsonError(e, 502);
  }
}
