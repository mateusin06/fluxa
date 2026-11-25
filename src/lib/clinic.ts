import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Clinic, Role } from '@/lib/types';
import { PRICING } from '@/lib/plans';

export const CLINIC_COOKIE = 'fluxa_clinic';

export function clinicWritable(c: Pick<Clinic, 'status' | 'trial_ends_at' | 'past_due_since'>): boolean {
  if (c.status === 'active') return true;
  if (c.status === 'trial') return new Date(c.trial_ends_at).getTime() > Date.now();
  if (c.status === 'past_due') {
    const since = c.past_due_since ? new Date(c.past_due_since).getTime() : Date.now();
    return since > Date.now() - PRICING.carenciaDias * 86400000;
  }
  return false;
}

/** Usuário logado + clínica atual. Redireciona quando falta algo. */
export const getContext = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/entrar');

  const { data: rows } = await supabase
    .from('memberships')
    .select('role, clinic:clinics(*)')
    .eq('user_id', user.id)
    .order('created_at');

  const list = (rows || [])
    .map((r) => ({ role: r.role as Role, clinic: r.clinic as unknown as Clinic }))
    .filter((r) => r.clinic);
  if (!list.length) redirect('/onboarding');

  const store = await cookies();
  const wanted = store.get(CLINIC_COOKIE)?.value;
  const cur = list.find((r) => r.clinic.id === wanted) || list[0];

  const { data: profile } = await supabase.from('profiles').select('full_name, is_platform_admin').eq('id', user.id).single();

  return {
    supabase,
    user,
    profile: profile || { full_name: '', is_platform_admin: false },
    clinic: cur.clinic,
    role: cur.role,
    isAdmin: cur.role === 'owner' || cur.role === 'admin',
    writable: clinicWritable(cur.clinic),
    clinics: list.map((r) => ({ id: r.clinic.id, name: r.clinic.name })),
  };
});

export type Ctx = Awaited<ReturnType<typeof getContext>>;
