import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { safeEqual } from '@/lib/apikey';
import { PRICING } from '@/lib/plans';
import { notifyFluxa } from '@/lib/notify';

// Roda 1x por dia (vercel.json). Bloqueia teste vencido, atraso além da carência e assinatura cancelada após o fim do ciclo.
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || !safeEqual(req.headers.get('authorization') || '', `Bearer ${process.env.CRON_SECRET}`)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const db = createAdminClient();
  const now = new Date().toISOString();
  const grace = new Date(Date.now() - PRICING.carenciaDias * 86400000).toISOString();

  const trials = await db.from('clinics').update({ status: 'blocked' }).eq('status', 'trial').lt('trial_ends_at', now).select('id, name');
  const late = await db.from('clinics').update({ status: 'blocked' }).eq('status', 'past_due').lt('past_due_since', grace).select('id, name');
  const { data: ended } = await db.from('subscriptions').select('clinic_id').eq('status', 'canceled').lt('current_period_end', now);
  let canceled = 0;
  for (const s of ended || []) {
    const r = await db.from('clinics').update({ status: 'canceled' }).eq('id', s.clinic_id).eq('status', 'active').select('id');
    canceled += r.data?.length || 0;
  }
  const out = { testes_vencidos: trials.data?.length || 0, atrasos_bloqueados: late.data?.length || 0, cancelados: canceled };
  if (out.testes_vencidos || out.atrasos_bloqueados || out.cancelados) {
    await notifyFluxa('saas_resumo_cobranca', { ...out, clinicas: [...(trials.data || []), ...(late.data || [])].map((c) => c.name).join(', ') });
  }
  return NextResponse.json(out);
}
