'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getContext } from '@/lib/clinic';

type S = { error?: string; ok?: string } | null;

export async function addCharge(_: S, fd: FormData): Promise<S> {
  const { supabase, clinic } = await getContext();
  const p = z.object({
    contact_id: z.string().uuid('Escolha o paciente'),
    description: z.string().max(200).optional(),
    amount: z.string().transform((v) => Number(v.replace(/\./g, '').replace(',', '.'))).refine((n) => n > 0, 'Valor inválido'),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida'),
    payment_link: z.string().url('Link inválido').or(z.literal('')).optional(),
  }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const { error } = await supabase.from('charges').insert({ clinic_id: clinic.id, contact_id: p.data.contact_id, description: p.data.description || null, amount: p.data.amount, due_date: p.data.due_date, payment_link: p.data.payment_link || null });
  if (error) return { error: error.message };
  revalidatePath('/app/financeiro');
  return { ok: 'Cobrança registrada.' };
}

export async function setChargeStatus(fd: FormData) {
  const { supabase, clinic } = await getContext();
  const status = z.enum(['aberto', 'pago', 'cancelado']).parse(fd.get('status'));
  await supabase.from('charges').update({ status, paid_at: status === 'pago' ? new Date().toISOString() : null })
    .eq('id', z.string().uuid().parse(fd.get('id'))).eq('clinic_id', clinic.id);
  revalidatePath('/app/financeiro');
}
