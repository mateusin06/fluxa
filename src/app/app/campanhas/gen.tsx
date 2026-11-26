'use client';
import { aiJson } from '@/lib/ai-fetch';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function CampaignGen() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function go(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true); setErr('');
    const r = await fetch('/api/ai/campaign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: fd.get('nome'), objetivo: fd.get('objetivo'), orcamento: Number(String(fd.get('orcamento')).replace(',', '.')), raio: fd.get('raio'), detalhes: fd.get('detalhes') }) });
    const j = await aiJson(r);
    setBusy(false);
    if (!r.ok) setErr(j.error || 'Falhou'); else router.refresh();
  }
  return (
    <form onSubmit={go} className="card grid gap-3 sm:grid-cols-3">
      <div><label className="label" htmlFor="nome">Nome</label><input id="nome" name="nome" required className="field" placeholder="Implantes — dezembro" /></div>
      <div><label className="label" htmlFor="objetivo">Objetivo</label><select id="objetivo" name="objetivo" className="field"><option value="agendar">Agendar avaliações pelo WhatsApp</option><option value="procedimento">Divulgar procedimento</option><option value="reativar">Reativar pacientes</option><option value="autoridade">Autoridade do profissional</option><option value="institucional">Institucional</option><option value="indicacao">Indicações</option></select></div>
      <div><label className="label" htmlFor="orcamento">Orçamento por dia (R$)</label><input id="orcamento" name="orcamento" required inputMode="decimal" className="field" defaultValue="30" /></div>
      <div className="sm:col-span-3"><label className="label" htmlFor="raio">Região</label><input id="raio" name="raio" className="field" placeholder="Piracicaba e 15 km ao redor" /></div>
      <div className="sm:col-span-3"><label className="label" htmlFor="detalhes">Detalhes</label><textarea id="detalhes" name="detalhes" rows={2} className="field" placeholder="Quantos criativos você tem, o que já testou, horários de atendimento..." /></div>
      <div className="sm:col-span-3"><button disabled={busy} className="btn btn-lima" type="submit">{busy ? 'Planejando...' : 'Gerar plano de campanha'}</button></div>
      {err && <p role="alert" className="text-sm text-red-700 sm:col-span-3">{err}</p>}
    </form>
  );
}
