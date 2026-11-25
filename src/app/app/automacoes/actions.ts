'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getContext } from '@/lib/clinic';
import { normPhone } from '@/lib/utils';
import { notifyFluxa } from '@/lib/notify';
import { AUTOMATION_FLOWS } from '@/lib/plans';

export async function requestAutomation(_: { error?: string; ok?: string } | null, fd: FormData) {
  const { supabase, clinic, isAdmin } = await getContext();
  if (!isAdmin) return { error: 'Apenas dono ou administrador pode contratar.' };
  const ids = new Set<string>(AUTOMATION_FLOWS.map((f) => f.id));
  const flows = fd.getAll('flows').map(String).filter((f) => ids.has(f));
  if (!flows.length) return { error: 'Escolha pelo menos uma automação.' };
  const phone = normPhone(String(fd.get('contact_phone') || ''));
  if (!phone) return { error: 'WhatsApp inválido' };
  const name = z.string().trim().min(2).max(120).parse(fd.get('contact_name'));
  const { data: open } = await supabase.from('automation_requests').select('id').eq('clinic_id', clinic.id).in('status', ['solicitado', 'em_instalacao']).maybeSingle();
  if (open) return { error: 'Já existe um pedido em andamento. A Fluxa vai falar com você pelo WhatsApp.' };
  const { error } = await supabase.from('automation_requests').insert({ clinic_id: clinic.id, flows, contact_name: name, contact_phone: phone, notes: String(fd.get('notes') || '').slice(0, 1000) });
  if (error) return { error: error.message };
  await notifyFluxa('saas_pedido_automacao', { clinica: clinic.name, clinic_id: clinic.id, tipo: clinic.kind, contato: name, telefone: phone, fluxos: flows.join(','), cidade: clinic.city || '' });
  revalidatePath('/app/automacoes');
  return { ok: 'Pedido enviado. A Fluxa vai chamar você no WhatsApp para agendar a instalação.' };
}
