'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { CLINIC_COOKIE } from '@/lib/clinic';
import { normPhone } from '@/lib/utils';
import { notifyFluxa } from '@/lib/notify';

export async function createClinic(_: { error?: string } | null, fd: FormData) {
  const p = z.object({
    name: z.string().trim().min(2, 'Informe o nome da clínica').max(120),
    kind: z.enum(['odonto', 'estetica']),
    phone: z.string().trim().min(10, 'Informe o WhatsApp da clínica'),
    city: z.string().trim().max(80).optional(),
    state: z.string().trim().max(2).optional(),
  }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const phone = normPhone(p.data.phone);
  if (!phone) return { error: 'WhatsApp inválido. Use DDD + número.' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('create_clinic', {
    p_name: p.data.name, p_kind: p.data.kind, p_phone: phone, p_city: p.data.city || null, p_state: (p.data.state || '').toUpperCase() || null,
  });
  if (error) return { error: error.message };
  (await cookies()).set(CLINIC_COOKIE, data as string, { httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 60 * 60 * 24 * 365 });
  await notifyFluxa('saas_nova_clinica', { clinica: p.data.name, tipo: p.data.kind, telefone: phone, cidade: p.data.city || '' });
  redirect('/app?bemvindo=1');
}
