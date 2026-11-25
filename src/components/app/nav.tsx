'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { BarChart3, CalendarDays, Wallet, CreditCard, KanbanSquare, Megaphone, Menu, PenTool, Settings, Shield, Sparkles, Users, Workflow, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/logo';

const ITEMS = [
  { href: '/app', label: 'Painel', icon: BarChart3 },
  { href: '/app/crm', label: 'Funil (CRM)', icon: KanbanSquare },
  { href: '/app/contatos', label: 'Pacientes e leads', icon: Users },
  { href: '/app/agenda', label: 'Agenda', icon: CalendarDays },
  { href: '/app/financeiro', label: 'Financeiro', icon: Wallet },
  { href: '/app/criativos', label: 'Criativos com IA', icon: PenTool },
  { href: '/app/textos', label: 'Textos com IA', icon: Sparkles },
  { href: '/app/campanhas', label: 'Campanhas', icon: Megaphone },
  { href: '/app/automacoes', label: 'Automações', icon: Workflow },
  { href: '/app/configuracoes', label: 'Clínica e equipe', icon: Settings },
  { href: '/app/assinatura', label: 'Assinatura', icon: CreditCard },
];

export function Nav({ clinicName, isPlatformAdmin, switcher }: { clinicName: string; isPlatformAdmin: boolean; switcher: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const links = (
    <nav aria-label="Menu principal" className="flex flex-col gap-1">
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = href === '/app' ? path === '/app' : path.startsWith(href);
        return (
          <Link key={href} href={href} onClick={() => setOpen(false)} aria-current={active ? 'page' : undefined}
            className={cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium', active ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white')}>
            <Icon size={18} aria-hidden="true" className={active ? 'text-lima' : ''} />{label}
          </Link>
        );
      })}
      {isPlatformAdmin && (
        <Link href="/admin" className="mt-2 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-lima hover:bg-white/5"><Shield size={18} aria-hidden="true" />Admin Fluxa</Link>
      )}
    </nav>
  );
  const body = (
    <div className="flex h-full flex-col gap-6 p-4">
      <Logo dark size={24} />
      <div className="rounded-lg bg-white/5 p-3">
        <p className="text-xs text-slate-400">Clínica</p>
        <p className="truncate text-sm font-semibold text-white">{clinicName}</p>
        {switcher}
      </div>
      {links}
      <form action="/auth/sair" method="post" className="mt-auto"><button className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-400 hover:text-white" type="submit">Sair</button></form>
    </div>
  );
  return (
    <>
      <div className="flex items-center justify-between bg-ink px-4 py-3 lg:hidden">
        <Logo dark size={22} />
        <button type="button" aria-label={open ? 'Fechar menu' : 'Abrir menu'} aria-expanded={open} onClick={() => setOpen(!open)} className="rounded-lg p-2 text-white">
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      {open && <div className="fixed inset-0 z-40 bg-ink lg:hidden">{body}</div>}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 bg-ink lg:block">{body}</aside>
    </>
  );
}
