'use server';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

type S = { error?: string; ok?: string } | null;

const safeNext = (n: unknown) => (typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') ? n : '/app');

async function origin() {
  const h = await headers();
  return process.env.NEXT_PUBLIC_APP_URL || `${h.get('x-forwarded-proto') || 'https'}://${h.get('host')}`;
}

export async function signIn(_: S, fd: FormData): Promise<S> {
  const p = z.object({ email: z.string().email('E-mail inválido'), password: z.string().min(1, 'Informe a senha') }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(p.data);
  if (error) return { error: error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error.message };
  redirect(safeNext(fd.get('next')));
}

export async function signUp(_: S, fd: FormData): Promise<S> {
  const p = z.object({
    full_name: z.string().trim().min(2, 'Informe seu nome'),
    email: z.string().email('E-mail inválido'),
    password: z.string().min(8, 'A senha precisa de pelo menos 8 caracteres'),
  }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: p.data.email,
    password: p.data.password,
    options: { data: { full_name: p.data.full_name }, emailRedirectTo: `${await origin()}/auth/confirm?next=/onboarding` },
  });
  if (error) return { error: error.message };
  if (data.session) redirect('/onboarding');
  return { ok: 'Conta criada. Enviamos um link de confirmação para o seu e-mail.' };
}

export async function forgot(_: S, fd: FormData): Promise<S> {
  const email = String(fd.get('email') || '');
  if (!z.string().email().safeParse(email).success) return { error: 'E-mail inválido' };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${await origin()}/auth/confirm?next=/nova-senha` });
  return { ok: 'Se o e-mail estiver cadastrado, você vai receber um link para criar uma nova senha.' };
}

export async function newPassword(_: S, fd: FormData): Promise<S> {
  const pw = String(fd.get('password') || '');
  if (pw.length < 8) return { error: 'A senha precisa de pelo menos 8 caracteres' };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: pw });
  if (error) return { error: error.message };
  redirect(safeNext(fd.get('next')));
}
