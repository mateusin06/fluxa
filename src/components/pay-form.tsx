'use client';
import { useState } from 'react';
import { METHODS } from '@/lib/payments';

/**
 * Botão de pagamento: ao clicar, pede a forma (Pix, cartão, dinheiro...) e as parcelas do cartão,
 * e só então envia para a ação do servidor junto com os campos escondidos.
 */
export function PayForm({ action, hidden, label, className, defaultMethod = 'pix' }: {
  action: (fd: FormData) => void | Promise<void>; hidden: Record<string, string>; label: string; className?: string; defaultMethod?: string;
}) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState(defaultMethod);
  const id = Object.values(hidden).join('-').replace(/[^a-z0-9-]/gi, '').slice(0, 60);
  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className={className || 'rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-emerald-800 hover:bg-emerald-100'}>{label}</button>;
  }
  return (
    <form action={action} className="flex flex-wrap items-center gap-1 rounded border border-emerald-300 bg-emerald-50 p-1 text-xs">
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <label className="sr-only" htmlFor={`pf-m-${id}`}>Forma de pagamento</label>
      <select id={`pf-m-${id}`} name="forma" value={method} onChange={(e) => setMethod(e.target.value)} className="rounded border border-slate-300 bg-white px-1 py-0.5" autoFocus>
        {METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      {method === 'credito' && (
        <>
          <label className="sr-only" htmlFor={`pf-p-${id}`}>Parcelas no cartão</label>
          <select id={`pf-p-${id}`} name="parcelas" defaultValue="1" className="rounded border border-slate-300 bg-white px-1 py-0.5">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n === 1 ? 'à vista' : `${n}x`}</option>)}
          </select>
        </>
      )}
      <button type="submit" className="rounded bg-emerald-700 px-2 py-0.5 font-semibold text-white hover:bg-emerald-800">Confirmar</button>
      <button type="button" onClick={() => setOpen(false)} className="px-1 text-slate-600 underline">cancelar</button>
    </form>
  );
}
