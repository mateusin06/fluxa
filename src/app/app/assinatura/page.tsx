import { getContext } from '@/lib/clinic';
import { PageHeader, Badge } from '@/components/bits';
import { PRICING, LIMITS, brl } from '@/lib/plans';
import { fmtDate } from '@/lib/utils';
import { monthlyCents } from '@/lib/billing';
import { Checkout, CancelButton } from './checkout';

export const metadata = { title: 'Assinatura' };
const ST = { trial: ['Teste grátis', 'blue'], active: ['Ativa', 'green'], past_due: ['Pagamento pendente', 'amber'], blocked: ['Bloqueada', 'red'], canceled: ['Cancelada', 'slate'] } as const;

export default async function Page() {
  const { supabase, clinic, isAdmin, role, user } = await getContext();
  const [{ data: sub }, { data: auto }, { data: usage }] = await Promise.all([
    supabase.from('subscriptions').select('*').eq('clinic_id', clinic.id).maybeSingle(),
    supabase.from('automation_requests').select('id').eq('clinic_id', clinic.id).eq('status', 'ativo').limit(1),
    supabase.from('ai_usage').select('kind').eq('clinic_id', clinic.id).gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
  ]);
  const total = monthlyCents(clinic.plan, !!auto?.length);
  const lim = LIMITS[clinic.plan];
  const used = { text: (usage || []).filter((u) => u.kind === 'text').length, image: (usage || []).filter((u) => u.kind === 'image').length };
  const hasSub = sub?.subscription_id && sub.status !== 'canceled';
  const [label, tone] = ST[clinic.status];

  return (
    <>
      <PageHeader title="Assinatura" />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <section className="card space-y-2">
            <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">Situação</h2><Badge tone={tone}>{label}</Badge></div>
            {clinic.status === 'trial' && <p className="text-sm">Seu teste vai até {fmtDate(clinic.trial_ends_at)}. Depois disso, a clínica fica em modo leitura até a assinatura.</p>}
            {sub?.current_period_end && <p className="text-sm">Período pago até {fmtDate(sub.current_period_end)}.</p>}
            {sub?.pending_payment_url && <p className="text-sm"><a className="font-semibold underline" href={sub.pending_payment_url} target="_blank" rel="noreferrer">Abrir boleto em aberto</a></p>}
            {sub?.status === 'canceled' && <p className="text-sm text-slate-600">Assinatura cancelada. Você pode assinar de novo a qualquer momento.</p>}
            <p className="text-sm text-slate-600">Uso de IA neste mês: {used.text}/{lim.textosIA} textos · {used.image}/{lim.imagensIA} imagens.</p>
            {hasSub && role === 'owner' && <div className="pt-2"><CancelButton /></div>}
          </section>
          {isAdmin && !hasSub && <Checkout publicKey={process.env.NEXT_PUBLIC_PAGARME_PUBLIC_KEY || ''} email={user.email || ''} total={brl(total)} />}
          {!isAdmin && <p className="text-sm text-slate-600">Só o dono ou um administrador pode alterar a assinatura.</p>}
        </div>
        <aside className="card h-fit space-y-2 text-sm">
          <h2 className="font-semibold">O que está incluso</h2>
          <p className="font-display text-3xl font-bold">{brl(PRICING.sistemaMensal)}<span className="text-sm font-normal">/mês</span></p>
          <ul className="list-disc space-y-1 pl-5">
            <li>CRM com funil, pacientes e linha do tempo</li><li>Agenda da clínica</li><li>Criativos e textos de anúncio com IA</li>
            <li>Planejador de campanhas na Meta</li><li>Até {lim.usuarios} usuários</li>
          </ul>
          <p className="pt-2">Automações de WhatsApp: {brl(PRICING.automacoesInstalacao)} de instalação + {brl(PRICING.automacoesMensal)}/mês.</p>
        </aside>
      </div>
    </>
  );
}
