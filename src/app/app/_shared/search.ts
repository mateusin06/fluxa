'use server';
import { getContext } from '@/lib/clinic';
import { fmtPhone } from '@/lib/utils';

export interface PatientHit { id: string; name: string; phone: string }

/** Busca pacientes da clínica por nome ou telefone (até 10). */
export async function searchPatients(q: string): Promise<PatientHit[]> {
  const term = String(q || '').replace(/[%,()*]/g, ' ').trim().slice(0, 60);
  if (term.length < 2) return [];
  const { supabase, clinic } = await getContext();
  const digits = term.replace(/\D/g, '');
  let query = supabase.from('contacts').select('id, name, phone').eq('clinic_id', clinic.id);
  query = digits.length >= 4 ? query.or(`name.ilike.%${term}%,phone.like.%${digits}%`) : query.ilike('name', `%${term}%`);
  const { data } = await query.order('name').limit(10);
  return (data || []).map((c) => ({ id: c.id, name: c.name, phone: c.phone ? fmtPhone(c.phone) : '' }));
}
