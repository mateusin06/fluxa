import Link from 'next/link';
import { CalendarDays, KanbanSquare, Megaphone, PenTool, Sparkles, Workflow } from 'lucide-react';
import { Logo } from '@/components/logo';
import { PRICING, brl } from '@/lib/plans';

const FEATURES = [
  { icon: KanbanSquare, t: 'CRM feito para clínica', d: 'Funil de leads até o orçamento fechado, linha do tempo de cada paciente, tarefas e origem de cada contato.' },
  { icon: CalendarDays, t: 'Agenda e faltas', d: 'Agenda por profissional, confirmação e registro de faltas. O painel mostra a taxa de falta do mês.' },
  { icon: PenTool, t: 'Criativos com IA', d: 'Envie a foto do profissional e o direcionamento. Saem artes para feed e stories na identidade da clínica, prontas para baixar.' },
  { icon: Sparkles, t: 'Textos que vendem', d: 'Texto de anúncio, legenda, roteiro de Reels e mensagens de WhatsApp com técnicas de negociação.' },
  { icon: Megaphone, t: 'Plano de campanha', d: 'Estrutura, público, orçamento e o que olhar a cada dia no Gerenciador de Anúncios da Meta.' },
  { icon: Workflow, t: 'Automações de WhatsApp', d: 'Confirmação, lista de espera, reativação, retorno, avaliação no Google e cobrança pela API oficial.' },
];

export default function Home() {
  return (
    <main>
      <header className="bg-ink">
        <nav aria-label="Principal" className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
          <Logo dark />
          <div className="flex items-center gap-3"><Link href="/entrar" className="text-sm font-semibold text-white">Entrar</Link><Link href="/cadastro" className="btn btn-lima">Testar 7 dias</Link></div>
        </nav>
        <section className="mx-auto max-w-6xl px-4 pb-20 pt-12 text-white">
          <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-lima">Para clínicas odontológicas e de estética</p>
          <h1 className="max-w-3xl font-display text-4xl font-bold leading-tight sm:text-6xl">Tudo que a sua clínica precisa para encher a agenda, <span className="text-lima">num lugar só.</span></h1>
          <p className="mt-6 max-w-2xl text-lg text-slate-300">CRM, agenda, anúncios e criativos com inteligência artificial, e automações de WhatsApp que trabalham enquanto a recepção atende.</p>
          <div className="mt-8 flex flex-wrap gap-3"><Link href="/cadastro" className="btn btn-lima px-6 text-base">Começar teste grátis</Link><a href="#precos" className="btn border border-white/30 px-6 text-base text-white">Ver preços</a></div>
        </section>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-16" aria-labelledby="recursos">
        <h2 id="recursos" className="mb-8 font-display text-3xl font-bold">O que vem no sistema</h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, t, d }) => (
            <article key={t} className="card"><Icon aria-hidden="true" className="mb-3 text-limadark" /><h3 className="font-semibold">{t}</h3><p className="mt-2 text-sm text-slate-600">{d}</p></article>
          ))}
        </div>
      </section>

      <section id="precos" className="bg-white py-16" aria-labelledby="precos-t">
        <div className="mx-auto max-w-6xl px-4">
          <h2 id="precos-t" className="mb-8 font-display text-3xl font-bold">Preços simples</h2>
          <div className="grid gap-6 md:grid-cols-2">
            <article className="card border-2 border-ink">
              <h3 className="font-semibold">Sistema Fluxa</h3>
              <p className="mt-2 font-display text-4xl font-bold">{brl(PRICING.sistemaMensal)}<span className="text-base font-normal">/mês</span></p>
              <ul className="mt-4 list-disc space-y-1 pl-5 text-sm"><li>CRM, agenda e painel</li><li>Criativos, textos e campanhas com IA</li><li>Até 5 usuários</li><li>7 dias grátis, sem cartão</li></ul>
              <Link href="/cadastro" className="btn btn-pri mt-6">Começar agora</Link>
            </article>
            <article className="card">
              <h3 className="font-semibold">Automações de WhatsApp</h3>
              <p className="mt-2 font-display text-4xl font-bold">{brl(PRICING.automacoesMensal)}<span className="text-base font-normal">/mês</span></p>
              <p className="text-sm text-slate-600">+ {brl(PRICING.automacoesInstalacao)} de instalação, uma vez</p>
              <ul className="mt-4 list-disc space-y-1 pl-5 text-sm"><li>Confirmação de consulta e lista de espera</li><li>Reativação e retorno de procedimento</li><li>Avaliação no Google e cobrança amigável</li><li>Leads do anúncio direto no CRM</li></ul>
              <p className="mt-4 text-xs text-slate-500">Contratado dentro do sistema. As mensagens da API oficial são cobradas pela Meta na conta da clínica.</p>
            </article>
          </div>
        </div>
      </section>

      <footer className="bg-ink px-4 py-10 text-sm text-slate-400">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4"><Logo dark size={20} /><span><Link className="underline" href="/termos">Termos</Link> · <Link className="underline" href="/privacidade">Privacidade</Link></span></div>
      </footer>
    </main>
  );
}
