import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { internalAuthorized } from '@/lib/apikey';
import { monthlyCents } from '@/lib/billing';

// Lista para o sistema interno da Fluxa (controle do SaaS). CORS liberado porque o sistema interno é um HTML local.
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'x-fluxa-token, content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
export function OPTIONS() { return new NextResponse(null, { headers: CORS }); }

export async function GET(req: Request) {
  if (!internalAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: CORS });
  const db = createAdminClient();
  const [{ data: clinics }, { data: subs }, { data: autos }, { data: owners }] = await Promise.all([
    db.from('clinics').select('id, name, kind, status, plan, city, state, whatsapp, source, trial_ends_at, past_due_since, created_at, owner_id').order('created_at', { ascending: false }).limit(5000),
    db.from('subscriptions').select('clinic_id, status, payment_method, amount_cents, current_period_end, last_event'),
    db.from('automation_requests').select('clinic_id, status, flows, created_at').neq('status', 'cancelado'),
    db.from('profiles').select('id, full_name'),
  ]);
  const S = new Map((subs || []).map((s) => [s.clinic_id, s]));
  const A = new Map((autos || []).map((a) => [a.clinic_id, a]));
  const P = new Map((owners || []).map((o) => [o.id, o.full_name]));
  const list = (clinics || []).map((c) => {
    const s = S.get(c.id), a = A.get(c.id);
    const paying = c.status === 'active' || c.status === 'past_due';
    return {
      ...c, dono: P.get(c.owner_id || '') || '', assinatura: s?.status || 'sem', metodo: s?.payment_method || '', pago_ate: s?.current_period_end || null,
      automacao: a?.status || '', automacao_fluxos: a?.flows || [], mrr_cents: paying ? monthlyCents(c.plan, a?.status === 'ativo') : 0,
    };
  });
  const mrr = list.reduce((x, c) => x + c.mrr_cents, 0);
  return NextResponse.json({
    agora: new Date().toISOString(), mrr_cents: mrr,
    totais: { clinicas: list.length, ativas: list.filter((c) => c.status === 'active').length, teste: list.filter((c) => c.status === 'trial').length, atraso: list.filter((c) => c.status === 'past_due').length, bloqueadas: list.filter((c) => c.status === 'blocked' || c.status === 'canceled').length },
    clinicas: list,
  }, { headers: CORS });
}
