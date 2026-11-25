import 'server-only';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CLINIC_COOKIE, clinicWritable } from '@/lib/clinic';
import type { Clinic, Role } from '@/lib/types';

/** Contexto para rotas de API (JSON em vez de redirecionar). */
export async function apiContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Faça login' }, { status: 401 }) } as const;
  const wanted = (await cookies()).get(CLINIC_COOKIE)?.value;
  const { data: rows } = await supabase.from('memberships').select('role, clinic:clinics(*)').eq('user_id', user.id).order('created_at');
  const list = (rows || []).map((r) => ({ role: r.role as Role, clinic: r.clinic as unknown as Clinic })).filter((r) => r.clinic);
  const cur = list.find((r) => r.clinic.id === wanted) || list[0];
  if (!cur) return { error: NextResponse.json({ error: 'Crie sua clínica primeiro' }, { status: 400 }) } as const;
  if (!clinicWritable(cur.clinic)) return { error: NextResponse.json({ error: 'Clínica em modo somente leitura: regularize a assinatura.' }, { status: 402 }) } as const;
  return { supabase, user, clinic: cur.clinic, role: cur.role } as const;
}

export const jsonError = (e: unknown, status = 500) =>
  NextResponse.json({ error: e instanceof Error ? e.message : 'Erro inesperado' }, { status });
