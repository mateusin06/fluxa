'use client';
import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { Search, X } from 'lucide-react';
import { searchPatients, type PatientHit } from '@/app/app/_shared/search';

/**
 * Campo de paciente com busca (lupa). Envia o id escolhido no formulário pelo campo `name`.
 * Digite 2 letras do nome ou 4 dígitos do telefone; setas para navegar, Enter para escolher, Esc para fechar.
 */
export function PatientPicker({ name = 'contact_id', label = 'Paciente', initial, disabled, required, className }: {
  name?: string; label?: string; initial?: { id: string; name: string } | null; disabled?: boolean; required?: boolean; className?: string;
}) {
  const uid = useId();
  const [text, setText] = useState(initial?.name || '');
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(initial || null);
  const [hits, setHits] = useState<PatientHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (picked && text === picked.name) return;
    const q = text.trim();
    if (q.length < 2) { setHits([]); setLoading(false); return; }
    const n = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try { const r = await searchPatients(q); if (n === seq.current) { setHits(r); setActive(r.length ? 0 : -1); } }
      catch { if (n === seq.current) setHits([]); }
      finally { if (n === seq.current) setLoading(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [text, picked]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  function choose(h: PatientHit) { setPicked({ id: h.id, name: h.name }); setText(h.name); setOpen(false); }
  function clear() { setPicked(null); setText(''); setHits([]); }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(hits.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' && open && hits[active]) { e.preventDefault(); choose(hits[active]); }
    else if (e.key === 'Escape') setOpen(false);
  }

  const listId = `${uid}-list`;
  const showList = open && !disabled && text.trim().length >= 2 && !(picked && text === picked.name);
  return (
    <div ref={box} className={`relative ${className || ''}`}>
      <label className="label" htmlFor={`${uid}-in`}>{label}</label>
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          id={`${uid}-in`} type="text" role="combobox" aria-expanded={showList} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${uid}-o${active}` : undefined}
          value={text} disabled={disabled} autoComplete="off" placeholder="Buscar por nome ou telefone"
          onChange={(e) => { setText(e.target.value); setOpen(true); if (picked && e.target.value !== picked.name) setPicked(null); }}
          onFocus={() => setOpen(true)} onKeyDown={onKey}
          className={`field pl-9 ${picked ? 'pr-9' : ''}`}
        />
        {picked && !disabled && (
          <button type="button" onClick={clear} aria-label="Trocar paciente" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" aria-hidden="true" /></button>
        )}
      </div>
      {/* campo enviado no formulário; obrigatório fica no texto visível para o navegador avisar */}
      <input type="hidden" name={name} value={picked?.id || ''} />
      {required && !disabled && !picked && <input tabIndex={-1} aria-hidden="true" required value="" onChange={() => {}} className="pointer-events-none absolute h-0 w-0 opacity-0" onInvalid={(e) => (e.target as HTMLInputElement).setCustomValidity('Escolha o paciente na lista')} />}
      {showList && (
        <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg">
          {loading && !hits.length && <li className="px-3 py-2 text-slate-500">Buscando...</li>}
          {!loading && !hits.length && (
            <li className="px-3 py-2 text-slate-600">Nenhum paciente com “{text.trim()}”. <Link className="underline" href="/app/contatos?novo=1">Cadastrar paciente</Link></li>
          )}
          {hits.map((h, i) => (
            <li key={h.id} id={`${uid}-o${i}`} role="option" aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); choose(h); }} onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-2 ${i === active ? 'bg-slate-100' : ''}`}>
              <span className="font-medium">{h.name}</span>{h.phone && <span className="ml-2 text-xs text-slate-500">{h.phone}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
