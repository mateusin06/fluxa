import { NextResponse } from 'next/server';
import { v1 } from '@/lib/v1';

// GET ?from=ISO&to=ISO&status=agendado,confirmado  (confirmação, lembretes, pós-atendimento)
export async function GET(req: Request) {
  const a = await v1(req); if ('error' in a) return a.error;
  const u = new URL(req.url);
  const from = u.searchParams.get('from') || new Date().toISOString();
  const to = u.searchParams.get('to') || new Date(Date.now() + 2 * 86400000).toISOString();
  let q = a.db.from('appointments')
    .select('id, starts_at, ends_at, status, notes, payer, insurance, insurance_auth, contact:contacts(id, name, phone, consent_whatsapp, insurance), procedure:procedures(name, return_days), professional:professionals(name)')
    .eq('clinic_id', a.clinicId).gte('starts_at', from).lt('starts_at', to).order('starts_at').limit(1000);
  const st = u.searchParams.get('status');
  if (st) q = q.in('status', st.split(',').map((s) => s.trim()).filter(Boolean));
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
