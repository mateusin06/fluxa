'use client';
import { aiJson } from '@/lib/ai-fetch';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const KINDS = [['anuncio', 'Anúncio (Meta Ads)'], ['legenda', 'Legenda de post'], ['whatsapp', 'Mensagem de WhatsApp'], ['google', 'Post no Google'], ['roteiro_video', 'Roteiro de Reels']] as const;

export function CopyGen() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function go(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true); setErr('');
    const r = await fetch('/api/ai/copies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: fd.get('kind'), topic: fd.get('topic'), tone: fd.get('tone'), qtd: Number(fd.get('qtd')) }) });
    const j = await aiJson(r);
    setBusy(false);
    if (!r.ok) setErr(j.error || 'Falhou'); else router.refresh();
  }
  return (
    <form onSubmit={go} className="card grid gap-3 sm:grid-cols-4">
      <div><label className="label" htmlFor="kind">Tipo</label><select id="kind" name="kind" className="field">{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      <div className="sm:col-span-2"><label className="label" htmlFor="topic">Tema</label><input id="topic" name="topic" required minLength={3} className="field" placeholder="Ex.: importância da limpeza a cada 6 meses" /></div>
      <div><label className="label" htmlFor="qtd">Variações</label><select id="qtd" name="qtd" defaultValue="3" className="field"><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option></select></div>
      <div className="sm:col-span-2"><label className="label" htmlFor="tone">Tom</label><select id="tone" name="tone" className="field"><option>acolhedor e confiante</option><option>sofisticado e exclusivo</option><option>direto e prático</option><option>leve e bem-humorado</option></select></div>
      <div className="flex items-end sm:col-span-2"><button disabled={busy} className="btn btn-lima" type="submit">{busy ? 'Escrevendo...' : 'Gerar textos'}</button></div>
      {err && <p role="alert" className="text-sm text-red-700 sm:col-span-4">{err}</p>}
    </form>
  );
}

export function CopyButton({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return <button type="button" className="text-xs font-semibold underline" onClick={() => { navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); }}>{ok ? 'Copiado' : 'Copiar'}</button>;
}
