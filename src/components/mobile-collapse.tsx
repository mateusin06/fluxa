'use client';
import { useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Formulário recolhido no celular (abre com um toque) e sempre aberto no computador.
 * forceOpen: abre também no celular (ex.: veio de "agendar neste horário").
 */
export function MobileCollapse({ title, forceOpen, children }: { title: string; forceOpen?: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mq = window.matchMedia('(max-width: 639.98px)');
    if (mq.matches && !forceOpen) el.open = false;
    const onChange = (e: MediaQueryListEvent) => { if (!e.matches) el.open = true; };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [forceOpen]);
  return (
    <details ref={ref} open className="mcollapse group">
      <summary className="card mb-0 flex cursor-pointer list-none items-center justify-between font-semibold group-open:mb-3 sm:hidden">
        <span>{title}</span>
        <ChevronDown size={18} aria-hidden="true" className="transition group-open:rotate-180" />
      </summary>
      {children}
    </details>
  );
}
