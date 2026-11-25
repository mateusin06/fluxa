import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Logo } from '@/components/logo';
import { OnboardingForm } from './form';

export const metadata = { title: 'Sua clínica' };

export default async function Page({ searchParams }: { searchParams: Promise<{ nova?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/entrar');
  const { count } = await supabase.from('memberships').select('clinic_id', { count: 'exact', head: true }).eq('user_id', user.id);
  if ((count || 0) > 0 && !(await searchParams).nova) redirect('/app');
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center"><Logo dark /></div>
        <div className="rounded-2xl bg-white p-6 shadow-xl sm:p-8">
          <h1 className="font-display text-2xl font-bold">Vamos montar sua clínica</h1>
          <p className="mb-6 mt-1 text-sm text-slate-600">Em 1 minuto: o funil, os procedimentos mais comuns e o estúdio de criativos já vêm prontos para o seu tipo de clínica.</p>
          <OnboardingForm />
        </div>
      </div>
    </main>
  );
}
