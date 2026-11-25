import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { CLINIC_COOKIE } from '@/lib/clinic';

export const metadata = { title: 'Convite' };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/entrar?next=${encodeURIComponent('/convite/' + token)}`);

  async function accept() {
    'use server';
    const sb = await createClient();
    const { data, error } = await sb.rpc('accept_invite', { p_token: token });
    if (error) redirect(`/convite/${token}?erro=${encodeURIComponent(error.message)}`);
    (await cookies()).set(CLINIC_COOKIE, data as string, { httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 31536000 });
    redirect('/app');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink px-4">
      <form action={accept} className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
        <h1 className="font-display text-2xl font-bold">Você foi convidado(a) para uma clínica na Fluxa</h1>
        <p className="mt-2 text-sm text-slate-600">Entrando como {user.email}. O convite precisa ter sido enviado para este e-mail.</p>
        <button className="btn btn-pri mt-6 w-full" type="submit">Aceitar convite</button>
        <Link href="/app" className="mt-3 inline-block text-sm underline">Agora não</Link>
      </form>
    </main>
  );
}
