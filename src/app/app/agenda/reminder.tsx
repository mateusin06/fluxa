'use client';
import { useState, useTransition } from 'react';
import { markReminderSent } from './actions';

/** Abre o WhatsApp com o lembrete pronto e registra que foi enviado. */
export function ReminderButton({ id, href, sent }: { id: string; href: string; sent: boolean }) {
  const [done, setDone] = useState(sent);
  const [pending, start] = useTransition();
  return (
    <a href={href} target="_blank" rel="noreferrer"
      onClick={() => start(async () => { await markReminderSent(id); setDone(true); })}
      className={`rounded border px-2 py-0.5 text-xs ${done ? 'border-slate-200 text-slate-500' : 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'}`}>
      {pending ? 'Registrando...' : done ? 'Lembrete enviado · reenviar' : 'Enviar lembrete no WhatsApp'}
    </a>
  );
}
