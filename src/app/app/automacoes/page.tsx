import { getContext } from '@/lib/clinic';
import { PageHeader, Badge } from '@/components/bits';
import { AUTOMATION_FLOWS, PRICING, brl } from '@/lib/plans';
import { fmtDate } from '@/lib/utils';
import { RequestForm } from './request';

export const metadata = { title: 'Automações' };
const ST = { solicitado: ['Solicitado', 'amber'], em_instalacao: ['Em instalação', 'blue'], ativo: ['Ativo', 'green'], cancelado: ['Cancelado', 'slate'] } as const;

export default async function Page() {
  const { supabase, clinic, isAdmin, writable, profile } = await getContext();
  const { data: reqs } = await supabase.from('automation_requests').select('*').eq('clinic_id', clinic.id).order('created_at', { ascending: false });
  const active = (reqs || []).find((r) => r.status === 'ativo');
  const names = Object.fromEntries(AUTOMATION_FLOWS.map((f) => [f.id, f.nome]));
  return (
    <>
      <PageHeader title="Automações de WhatsApp" desc="A recepção para de fazer o trabalho repetitivo: confirmação, lista de espera, retorno, reativação, avaliação no Google e cobrança, pelo WhatsApp oficial (API da Meta)." />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <section className="card">
          {active ? (
            <>
              <h2 className="font-semibold">Suas automações estão ativas</h2>
              <ul className="mt-3 space-y-1 text-sm">{(active.flows as string[]).map((f) => <li key={f}>✓ {names[f] || f}</li>)}</ul>
              <p className="mt-4 text-sm text-slate-600">Para incluir ou mudar uma automação, fale com a Fluxa pelo WhatsApp.</p>
              <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm">
                <p className="font-semibold">Integração com o sistema</p>
                <p className="mt-1 text-slate-600">As automações leem a agenda, os pacientes, a lista de espera e o financeiro daqui e gravam de volta: confirmações, respostas e leads aparecem na linha do tempo e no funil. Para isso, a Fluxa usa uma chave de API da clínica, criada em <a className="underline" href="/app/configuracoes">Clínica e equipe → Chaves de API</a>.</p>
              </div>
            </>
          ) : isAdmin && writable ? <RequestForm phone={clinic.whatsapp || ''} name={profile.full_name || ''} /> : <p className="text-sm text-slate-600">Peça ao dono da conta para contratar as automações.</p>}
        </section>
        <aside className="card h-fit">
          <h2 className="font-semibold">Investimento</h2>
          <p className="mt-3 text-sm">Instalação (uma vez)</p><p className="font-display text-2xl font-bold">{brl(PRICING.automacoesInstalacao)}</p>
          <p className="mt-3 text-sm">Manutenção mensal</p><p className="font-display text-2xl font-bold">{brl(PRICING.automacoesMensal)}<span className="text-sm font-normal">/mês</span></p>
          <p className="mt-3 text-xs text-slate-600">Além da assinatura do sistema ({brl(PRICING.sistemaMensal)}/mês). As mensagens da API oficial do WhatsApp são cobradas pela Meta direto na conta da clínica.</p>
          {(reqs || []).length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <h3 className="mb-2 text-sm font-semibold">Pedidos</h3>
              <ul className="space-y-1 text-sm">{(reqs || []).map((r) => <li key={r.id}>{fmtDate(r.created_at)} <Badge tone={ST[r.status as keyof typeof ST][1]}>{ST[r.status as keyof typeof ST][0]}</Badge></li>)}</ul>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
