import 'server-only';
import { NextResponse } from 'next/server';
import { clinicFromApiKey } from '@/lib/apikey';
import { createAdminClient } from '@/lib/supabase/admin';

/** Autentica a API v1 pela chave da clínica e devolve um cliente de serviço preso a essa clínica. */
export async function v1(req: Request) {
  const clinicId = await clinicFromApiKey(req);
  if (!clinicId) return { error: NextResponse.json({ error: 'Chave de API inválida' }, { status: 401 }) } as const;
  const db = createAdminClient();
  const { data: c } = await db.from('clinics').select('status, trial_ends_at, past_due_since').eq('id', clinicId).single();
  const ok = c && (c.status === 'active' || (c.status === 'trial' && new Date(c.trial_ends_at) > new Date()) || c.status === 'past_due');
  if (!ok) return { error: NextResponse.json({ error: 'Clínica sem assinatura ativa' }, { status: 402 }) } as const;
  return { clinicId, db } as const;
}
