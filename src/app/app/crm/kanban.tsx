'use client';
import Link from 'next/link';
import { useOptimistic, useState, useTransition } from 'react';
import { MessageCircle } from 'lucide-react';
import { money, waLink, firstName } from '@/lib/utils';
import { moveDeal } from '../crm-actions';

export interface KDeal { id: string; title: string; value: number; stage_id: string; position: number; contact_id: string; updated_at: string; contact: { name: string; phone: string | null; insurance?: string | null } }
interface KStage { id: string; name: string; kind: string; color: string }

export function Kanban({ stages, deals, readOnly }: { stages: KStage[]; deals: KDeal[]; readOnly: boolean }) {
  const [, start] = useTransition();
  const [err, setErr] = useState('');
  const [items, apply] = useOptimistic(deals, (cur: KDeal[], m: { id: string; stage_id: string; position: number }) =>
    cur.map((d) => (d.id === m.id ? { ...d, stage_id: m.stage_id, position: m.position } : d)));
  const [drag, setDrag] = useState<string | null>(null);

  function drop(stageId: string) {
    if (!drag || readOnly) return;
    const deal = items.find((d) => d.id === drag);
    setDrag(null);
    if (!deal || deal.stage_id === stageId) return;
    const col = items.filter((d) => d.stage_id === stageId);
    const position = col.length ? Math.max(...col.map((d) => d.position)) + 1 : 0;
    const st = stages.find((s) => s.id === stageId);
    let reason: string | undefined;
    if (st?.kind === 'lost') reason = window.prompt('Motivo da perda (opcional):') || '';
    start(async () => {
      apply({ id: deal.id, stage_id: stageId, position });
      const r = await moveDeal(deal.id, stageId, position, reason);
      if (r && 'error' in r && r.error) setErr(r.error);
    });
  }

  function moveBy(deal: KDeal, dir: 1 | -1) {
    const i = stages.findIndex((s) => s.id === deal.stage_id);
    const to = stages[i + dir];
    if (!to || readOnly) return;
    start(async () => {
      apply({ id: deal.id, stage_id: to.id, position: Date.now() });
      await moveDeal(deal.id, to.id, Date.now());
    });
  }

  return (
    <>
      {err && <p role="alert" className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:snap-none sm:gap-4 sm:px-0">
        {stages.map((s) => {
          const col = items.filter((d) => d.stage_id === s.id).sort((a, b) => a.position - b.position);
          const total = col.reduce((a, d) => a + d.value, 0);
          return (
            <section key={s.id} aria-label={s.name} onDragOver={(e) => e.preventDefault()} onDrop={() => drop(s.id)}
              className="flex w-[84vw] max-w-[20rem] shrink-0 snap-start flex-col rounded-xl bg-slate-100 p-3 sm:w-72">
              <header className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold"><span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />{s.name} <span className="text-slate-500">{col.length}</span></h2>
                <span className="text-xs text-slate-600">{money(total)}</span>
              </header>
              <div className="flex min-h-24 flex-col gap-2">
                {col.map((d) => (
                  <article key={d.id} draggable={!readOnly} onDragStart={() => setDrag(d.id)}
                    className="cursor-grab rounded-lg border border-slate-200 bg-white p-3 shadow-sm active:cursor-grabbing">
                    <Link href={`/app/contatos/${d.contact_id}`} className="block font-semibold text-slate-900 hover:underline">{d.contact.name}</Link>
                    {d.contact.insurance && <p className="mt-0.5 inline-block rounded bg-violet-100 px-1.5 text-[11px] font-semibold text-violet-800">Convênio {d.contact.insurance}</p>}
                    <p className="text-sm text-slate-600">{d.title}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-sm font-semibold">{money(d.value)}</span>
                      <span className="flex items-center gap-1">
                        {d.contact.phone && <a href={waLink(d.contact.phone, `Oi, ${firstName(d.contact.name)}!`)} target="_blank" rel="noreferrer" aria-label={`WhatsApp de ${d.contact.name}`} className="rounded p-1 text-emerald-700 hover:bg-emerald-50"><MessageCircle size={16} /></a>}
                        {!readOnly && <>
                          <button type="button" onClick={() => moveBy(d, -1)} aria-label="Voltar etapa" className="rounded px-1.5 text-slate-500 hover:bg-slate-100">‹</button>
                          <button type="button" onClick={() => moveBy(d, 1)} aria-label="Avançar etapa" className="rounded px-1.5 text-slate-500 hover:bg-slate-100">›</button>
                        </>}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
