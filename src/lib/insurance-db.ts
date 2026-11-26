import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { acceptedInsurance, cleanInsurance, type InsClinic } from '@/lib/insurance';

/** Dados de convênio da clínica (atende? quais?). */
export async function insClinic(db: SupabaseClient, cid: string): Promise<InsClinic> {
  const { data } = await db.from('clinics').select('accepts_insurance, insurances').eq('id', cid).maybeSingle();
  return { accepts_insurance: !!data?.accepts_insurance, insurances: (data?.insurances as string[] | null) || [] };
}

/**
 * Lead/paciente informou o convênio (automação ou API).
 * Grava no cadastro e deixa claro para a recepção se a clínica atende esse convênio.
 * Devolve 'aceito' | 'nao_atendido' | null (sem convênio informado).
 */
export async function applyContactInsurance(db: SupabaseClient, cid: string, contactId: string, raw: { convenio?: string | null; carteirinha?: string | null; plano?: string | null }, clinic?: InsClinic) {
  const name = cleanInsurance(raw.convenio);
  if (!name) return null;
  const c = clinic || (await insClinic(db, cid));
  const ok = acceptedInsurance(c, name);
  const { data: ct } = await db.from('contacts').select('tags').eq('id', contactId).maybeSingle();
  const tags = new Set<string>(((ct?.tags as string[] | null) || []).filter((t) => t !== 'convênio não atendido'));
  if (!ok) tags.add('convênio não atendido');
  await db.from('contacts').update({
    insurance: ok || name,
    ...(raw.carteirinha ? { insurance_card: String(raw.carteirinha).trim().slice(0, 40) } : {}),
    ...(raw.plano ? { insurance_plan: String(raw.plano).trim().slice(0, 80) } : {}),
    tags: [...tags],
  }).eq('id', contactId);
  await db.from('activities').insert({
    clinic_id: cid, contact_id: contactId, type: 'sistema',
    body: ok ? `Informou o convênio ${ok}${raw.carteirinha ? ` (carteirinha ${raw.carteirinha})` : ''}: a clínica atende, as consultas saem pelo convênio.`
      : `Informou o convênio ${name}, que a clínica ${c.accepts_insurance ? 'não atende' : 'não atende (só particular)'}: ofereça o atendimento particular.`,
  });
  return ok ? 'aceito' : 'nao_atendido';
}
