import Link from 'next/link';
import { getContext } from '@/lib/clinic';
import { Nav } from '@/components/app/nav';
import { ReadOnlyBanner } from '@/components/bits';
import { switchClinic } from './actions-shell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext();
  const c = ctx.clinic;
  const trialLeft = c.status === 'trial' ? Math.ceil((new Date(c.trial_ends_at).getTime() - Date.now()) / 86400000) : null;
  const switcher = ctx.clinics.length > 1 ? (
    <form action={switchClinic} className="mt-2 flex gap-1">
      <label htmlFor="sw" className="sr-only">Trocar de clínica</label>
      <select id="sw" name="clinic_id" defaultValue={c.id} className="min-w-0 flex-1 rounded bg-white/10 px-2 py-1 text-xs text-white">
        {ctx.clinics.map((x) => <option key={x.id} value={x.id} className="text-ink">{x.name}</option>)}
      </select>
      <button className="rounded bg-white/10 px-2 text-xs text-white" type="submit">Ir</button>
    </form>
  ) : (
    <Link href="/onboarding?nova=1" className="mt-1 inline-block text-xs text-slate-400 underline">Adicionar outra clínica</Link>
  );
  return (
    <div className="lg:flex">
      <Nav clinicName={c.name} isPlatformAdmin={!!ctx.profile.is_platform_admin} switcher={switcher} />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8">
        {!ctx.writable && <ReadOnlyBanner />}
        {ctx.writable && trialLeft !== null && trialLeft <= 7 && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
            <span>Teste grátis: {trialLeft <= 0 ? 'termina hoje' : `${trialLeft} dia(s) restantes`}.</span>
            {ctx.isAdmin && <Link href="/app/assinatura" className="btn btn-lima min-h-8 px-3 py-1">Assinar por R$ 197/mês</Link>}
          </div>
        )}
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
