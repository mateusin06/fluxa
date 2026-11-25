'use client';
import { useFormStatus } from 'react-dom';
import { cn } from '@/lib/utils';

export function Submit({ children, className, pending: label = 'Salvando...', variant = 'pri' }: { children: React.ReactNode; className?: string; pending?: string; variant?: 'pri' | 'lima' | 'sec' | 'danger' }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={cn('btn', `btn-${variant}`, className)}>
      {pending ? label : children}
    </button>
  );
}

export function FormMsg({ state }: { state?: { error?: string; ok?: string } | null }) {
  if (!state) return null;
  if (state.error) return <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>;
  if (state.ok) return <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.ok}</p>;
  return null;
}
