'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getContext } from '@/lib/clinic';
import { EXPENSE_KEYS, METHOD_KEYS, parseMoney } from '@/lib/payments';

type S = { error?: string; ok?: string } | null;

const refresh = () => { revalidatePath('/app/financeiro'); revalidatePath('/app/agenda'); revalidatePath('/app'); };

export async function addCharge(_: S, fd: FormData): Promise<S> {
  const { supabase, clinic } = await getContext();
  const p = z.object({
    contact_id: z.string().uuid('Escolha o paciente'),
    description: z.string().max(200).optional(),
    amount: z.string().transform((v) => parseMoney(v) ?? NaN).refine((n) => n > 0, 'Valor inválido'),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida'),
    payment_link: z.string().url('Link inválido').or(z.literal('')).optional(),
  }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const { error } = await supabase.from('charges').insert({ clinic_id: clinic.id, contact_id: p.data.contact_id, description: p.data.description || null, amount: p.data.amount, due_date: p.data.due_date, payment_link: p.data.payment_link || null });
  if (error) return { error: error.message };
  refresh();
  return { ok: 'Cobrança registrada.' };
}

/** Pago (com forma e parcelas do cartão) ou cancelado. */
export async function setChargeStatus(fd: FormData) {
  const { supabase, clinic } = await getContext();
  const status = z.enum(['aberto', 'pago', 'cancelado']).parse(fd.get('status'));
  const method = z.enum(METHOD_KEYS).nullable().catch(null).parse(fd.get('forma') || null);
  const installments = Math.min(24, Math.max(1, Number(fd.get('parcelas')) || 1));
  const patch: Record<string, unknown> = { status, paid_at: status === 'pago' ? new Date().toISOString() : null };
  if (status === 'pago') { patch.payment_method = method || 'pix'; patch.installments = method === 'credito' ? installments : 1; }
  await supabase.from('charges').update(patch).eq('id', z.string().uuid().parse(fd.get('id'))).eq('clinic_id', clinic.id);
  refresh();
}

// ------------------------------------------------------------------ despesas
async function adminCtx() {
  const ctx = await getContext();
  if (!ctx.isAdmin) throw new Error('Apenas dono ou administrador');
  if (!ctx.writable) throw new Error('A conta está em modo leitura.');
  return ctx;
}

export async function addExpense(_: S, fd: FormData): Promise<S> {
  try {
    const { supabase, clinic, user } = await adminCtx();
    const p = z.object({
      description: z.string().trim().min(1, 'Descreva a despesa').max(200),
      category: z.enum(EXPENSE_KEYS),
      amount: z.string().transform((v) => parseMoney(v) ?? NaN).refine((n) => n > 0, 'Valor inválido'),
      due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida'),
      repeat: z.coerce.number().int().min(1).max(24).catch(1),
      paid: z.string().optional(),
      method: z.enum(METHOD_KEYS).or(z.literal('')).optional(),
      professional_id: z.string().uuid().or(z.literal('')).optional(),
    }).safeParse(Object.fromEntries(fd));
    if (!p.success) return { error: p.error.issues[0].message };
    const d = p.data;
    const [y, m, day] = d.due_date.split('-').map(Number);
    const rows = Array.from({ length: d.repeat }, (_, i) => {
      // mesmo dia nos meses seguintes (ou o último dia do mês, se não existir)
      const last = new Date(Date.UTC(y, m - 1 + i + 1, 0)).getUTCDate();
      const due = new Date(Date.UTC(y, m - 1 + i, Math.min(day, last))).toISOString().slice(0, 10);
      const paid = i === 0 && d.paid === 'on';
      return {
        clinic_id: clinic.id, description: d.repeat > 1 ? `${d.description} (${i + 1}/${d.repeat})` : d.description, category: d.category, amount: d.amount,
        due_date: due, status: paid ? 'pago' : 'aberto', paid_at: paid ? new Date().toISOString() : null, payment_method: paid ? d.method || 'pix' : null,
        professional_id: d.professional_id || null, created_by: user.id,
      };
    });
    const { error } = await supabase.from('expenses').insert(rows);
    if (error) return { error: error.message };
    refresh();
    return { ok: d.repeat > 1 ? `${d.repeat} despesas lançadas (uma por mês).` : 'Despesa lançada.' };
  } catch (e) { return { error: (e as Error).message }; }
}

export async function setExpenseStatus(fd: FormData) {
  const { supabase, clinic } = await adminCtx();
  const status = z.enum(['aberto', 'pago', 'cancelado']).parse(fd.get('status'));
  const method = z.enum(METHOD_KEYS).nullable().catch(null).parse(fd.get('forma') || null);
  await supabase.from('expenses').update({ status, paid_at: status === 'pago' ? new Date().toISOString() : null, payment_method: status === 'pago' ? method || 'pix' : null })
    .eq('id', z.string().uuid().parse(fd.get('id'))).eq('clinic_id', clinic.id);
  refresh();
}

/** Lança a comissão do mês de um profissional como despesa em aberto (uma vez por mês). */
export async function commissionToExpense(fd: FormData) {
  const { supabase, clinic, user } = await adminCtx();
  const pid = z.string().uuid().parse(fd.get('professional_id'));
  const ym = z.string().regex(/^\d{4}-\d{2}$/).parse(fd.get('mes'));
  const amount = Math.round(Number(fd.get('valor')) * 100) / 100;
  if (!(amount > 0)) return;
  const { data: pro } = await supabase.from('professionals').select('name').eq('id', pid).eq('clinic_id', clinic.id).maybeSingle();
  if (!pro) return;
  const { data: dup } = await supabase.from('expenses').select('id').eq('clinic_id', clinic.id).eq('category', 'comissao').eq('professional_id', pid).eq('meta->>mes', ym).neq('status', 'cancelado').limit(1);
  if (dup?.length) return;
  const [y, m] = ym.split('-').map(Number);
  const due = new Date(Date.UTC(y, m, 5)).toISOString().slice(0, 10); // dia 5 do mês seguinte
  await supabase.from('expenses').insert({ clinic_id: clinic.id, description: `Comissão ${pro.name} · ${String(m).padStart(2, '0')}/${y}`, category: 'comissao', amount, due_date: due, professional_id: pid, meta: { mes: ym }, created_by: user.id });
  refresh();
}
