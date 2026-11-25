import Link from 'next/link';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runAdminAction, type AdminAction } from '@/lib/admin-actions';
import { monthlyCents } from '@/lib/billing';
import { brl } from '@/lib/plans';
import { fmtDate, fmtPhone } from '@/lib/utils';
import { Badge, PageHeader, Stat } from '@/components/bits';
import { Logo } from '@/components/logo';

export const metadata = { title: 'Admin Fluxa' };

async function requireAdmin() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/entrar');
  const { data: p } = await sb.from('profiles').select('is_platform_admin').eq('id', user.id).single();
  if (!p?.is_platform_admin) redirect('/app');
  return user;
}

async function act(fd: FormData) {
  'use server';
  const user = await requireAdmin();
  const action = z.enum(['ativar_manual', 'bloquear', 'desbloquear', 'estender_teste', 'automacao_instalando', 'automacao_ativa', 'automacao_cancelada']).parse(fd.get('action'));
  await runAdminAction(z.string().uuid().parse(fd.get('clinic_id')), action as AdminAction, user.id);
  revalidatePath('/admin');
}

const TONE = { trial: 'blue', active: 'green', past_due: 'amber', blocked: 'red', canceled: 'slate' } as const;

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ q?: string; st?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const db = createAdminClient();
  let q = db.from('clinics').select('id, name, kind, status, plan, city, whatsapp, source, trial_ends_at, created_at').order('created_at', { ascending: false }).limit(500);
  if (sp.q) q = q.ilike('name', `%${sp.q.replace(/[%,]/g, '')}%`);
  if (sp.st) q = q.eq('status', sp.st);
  const [{ data: clinics }, { data: autos }, { data: allStatus }] = await Promise.all([
    q, db.from('automation_requests').select('clinic_id, status, flows, contact_name, contact_phone, created_at').neq('status', 'cancelado').order('created_at', { ascending: false }),
    db.from('clinics').select('status, plan, id'),
  ]);
  const A = new Map((autos || []).map((a) => [a.clinic_id, a]));
  const mrr = (allStatus || []).filter((c) => c.status === 'active' || c.status === 'past_due').reduce((s, c) => s + monthlyCents(c.plan, A.get(c.id)?.status === 'ativo'), 0);
  const count = (s: string) => (allStatus || []).filter((c) => c.status === s).length;
  const pend = (autos || []).filter((a) => a.status !== 'ativo');

  return (
    <main className="min-h-screen">
      <header className="flex items-center justify-between bg-ink px-6 py-4"><Logo dark size={22} /><Link href="/app" className="text-sm text-slate-300 underline">Voltar ao app</Link></header>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8">
        <PageHeader title="Admin Fluxa" desc="Todas as clínicas do SaaS, receita recorrente e pedidos de automação." />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <Stat label="MRR" value={brl(mrr)} hint="Ativas + em atraso" /><Stat label="Ativas" value={count('active')} /><Stat label="Em teste" value={count('trial')} />
          <Stat label="Em atraso" value={count('past_due')} /><Stat label="Bloq./cancel." value={count('blocked') + count('canceled')} />
        </div>
        {pend.length > 0 && (
          <section className="card mt-6">
            <h2 className="mb-2 font-semibold">Automações a instalar</h2>
            <ul className="space-y-1 text-sm">{pend.map((a) => <li key={a.clinic_id}>{(clinics || []).find((c) => c.id === a.clinic_id)?.name || a.clinic_id} · {a.contact_name} {fmtPhone(a.contact_phone)} · {(a.flows || []).join(', ')} <Badge tone="amber">{a.status}</Badge></li>)}</ul>
          </section>
        )}
        <form className="mt-6 flex flex-wrap gap-2" role="search">
          <label htmlFor="q" className="sr-only">Buscar</label><input id="q" name="q" defaultValue={sp.q} placeholder="Nome da clínica" className="field max-w-xs" />
          <label htmlFor="st" className="sr-only">Status</label>
          <select id="st" name="st" defaultValue={sp.st || ''} className="field max-w-48"><option value="">Todos</option><option value="trial">Teste</option><option value="active">Ativa</option><option value="past_due">Atraso</option><option value="blocked">Bloqueada</option><option value="canceled">Cancelada</option></select>
          <button className="btn btn-sec" type="submit">Filtrar</button>
        </form>
        <div className="card mt-4 overflow-x-auto p-0">
          <table className="tbl">
            <thead><tr><th>Clínica</th><th>Status</th><th>Plano</th><th>Automações</th><th>Origem</th><th>Criada</th><th>Ações</th></tr></thead>
            <tbody>
              {(clinics || []).map((c) => (
                <tr key={c.id}>
                  <td><b>{c.name}</b><br /><span className="text-xs text-slate-500">{c.kind} · {c.city} · {fmtPhone(c.whatsapp)}</span></td>
                  <td><Badge tone={TONE[c.status as keyof typeof TONE]}>{c.status}</Badge>{c.status === 'trial' && <div className="text-xs text-slate-500">até {fmtDate(c.trial_ends_at)}</div>}</td>
                  <td>{c.plan === 'sistema' ? 'Sistema' : 'Sistema + automações'}</td>
                  <td>{A.get(c.id)?.status || '—'}</td>
                  <td>{c.source}</td>
                  <td>{fmtDate(c.created_at)}</td>
                  <td>
                    <form action={act} className="flex gap-1">
                      <input type="hidden" name="clinic_id" value={c.id} />
                      <label htmlFor={`a-${c.id}`} className="sr-only">Ação</label>
                      <select id={`a-${c.id}`} name="action" className="field py-1 text-xs">
                        <option value="estender_teste">+7 dias de teste</option><option value="ativar_manual">Ativar (pagamento manual)</option>
                        <option value="bloquear">Bloquear</option><option value="desbloquear">Desbloquear (3 dias)</option>
                        <option value="automacao_instalando">Automação: em instalação</option><option value="automacao_ativa">Automação: ativa</option><option value="automacao_cancelada">Automação: cancelada</option>
                      </select>
                      <button className="btn btn-sec min-h-8 px-2 py-1 text-xs" type="submit">OK</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
