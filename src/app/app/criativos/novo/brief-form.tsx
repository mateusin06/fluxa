'use client';
import { aiJson } from '@/lib/ai-fetch';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { createBrief } from '../actions';

interface Pro { id: string; name: string; specialty: string | null; photo: string | null }
const OBJ = [
  ['agendar', 'Gerar conversas para agendar avaliação'], ['procedimento', 'Divulgar um procedimento'], ['reativar', 'Trazer pacientes de volta'],
  ['autoridade', 'Mostrar o profissional'], ['institucional', 'Apresentar a clínica'], ['indicacao', 'Estimular indicações'],
] as const;

export function BriefForm({ clinicId, pros, procs }: { clinicId: string; pros: Pro[]; procs: { id: string; name: string }[] }) {
  const router = useRouter();
  const [step, setStep] = useState('');
  const [err, setErr] = useState('');
  const [files, setFiles] = useState<File[]>([]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr('');
    const fd = new FormData(e.currentTarget);
    const formats = fd.getAll('formats').map(String);
    if (!formats.length) return setErr('Escolha pelo menos um formato.');
    try {
      const paths: string[] = [];
      if (files.length) {
        setStep('Enviando fotos...');
        const sb = createClient();
        for (const f of files) {
          if (f.size > 10 * 1024 * 1024) throw new Error(`${f.name}: máximo 10 MB por foto`);
          const ext = f.type === 'image/png' ? 'png' : f.type === 'image/webp' ? 'webp' : 'jpg';
          const path = `${clinicId}/briefs/${crypto.randomUUID()}.${ext}`;
          const { error } = await sb.storage.from('clinic-files').upload(path, f, { contentType: f.type });
          if (error) throw new Error(error.message);
          paths.push(path);
        }
      }
      setStep('Salvando briefing...');
      const r = await createBrief({
        title: String(fd.get('title') || ''), objective: String(fd.get('objective')), procedure_id: String(fd.get('procedure_id') || '') || null,
        professional_ids: fd.getAll('professional_ids').map(String), audience: String(fd.get('audience') || ''), tone: String(fd.get('tone') || ''),
        offer: String(fd.get('offer') || ''), instructions: String(fd.get('instructions') || ''), formats, photo_paths: paths,
      });
      if (r.error || !r.id) throw new Error(r.error || 'Falhou');
      setStep('A IA está escrevendo as artes e os textos (até 1 minuto). Depois, os fundos são criados no estúdio...');
      const g = await fetch('/api/ai/creatives', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ briefId: r.id, variacoes: Number(fd.get('variacoes') || 3) }) });
      const j = await aiJson(g);
      if (!g.ok) { router.push(`/app/criativos/${r.id}?erro=${encodeURIComponent(j.error || 'Falha na IA')}`); return; }
      router.push(`/app/criativos/${r.id}`);
    } catch (x) {
      setErr((x as Error).message);
      setStep('');
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <section className="card grid gap-4 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">1. O que você quer anunciar</h2>
        <div><label className="label" htmlFor="title">Nome do criativo</label><input id="title" name="title" required className="field" placeholder="Ex.: Implantes novembro" /></div>
        <div><label className="label" htmlFor="objective">Objetivo</label><select id="objective" name="objective" className="field">{OBJ.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div><label className="label" htmlFor="procedure_id">Procedimento</label><select id="procedure_id" name="procedure_id" className="field"><option value="">Nenhum específico</option>{procs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        <div><label className="label" htmlFor="tone">Tom de voz</label><select id="tone" name="tone" className="field"><option>acolhedor e confiante</option><option>sofisticado e exclusivo</option><option>direto e prático</option><option>leve e bem-humorado</option></select></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="audience">Público</label><input id="audience" name="audience" className="field" placeholder="Ex.: adultos de 35 a 60 anos que perderam dentes, em Piracicaba" /></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="offer">Mensagem principal</label><input id="offer" name="offer" className="field" placeholder="Ex.: avaliação com planejamento digital e acompanhamento do início ao fim" /></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="instructions">Como você quer as artes</label><textarea id="instructions" name="instructions" rows={3} className="field" placeholder="Cores, estilo, o que não pode faltar, o que evitar, frases que vocês usam..." /></div>
      </section>

      <section className="card space-y-4">
        <h2 className="font-semibold">2. Fotos</h2>
        {pros.length ? (
          <fieldset>
            <legend className="label">Profissionais que aparecem (as fotos vêm do cadastro)</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {pros.map((p) => (
                <label key={p.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-300 p-2 has-[:checked]:border-ink has-[:checked]:bg-slate-50">
                  <input type="checkbox" name="professional_ids" value={p.id} />
                  {p.photo ? <img src={p.photo} alt="" className="h-12 w-12 rounded-full object-cover" /> : <span className="h-12 w-12 rounded-full bg-slate-200" />}
                  <span className="text-sm"><b>{p.name}</b><br /><span className="text-slate-500">{p.specialty}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : <p className="text-sm text-slate-600">Dica: cadastre os profissionais com foto em <a className="underline" href="/app/configuracoes#profissionais">Clínica e equipe</a>.</p>}
        <div>
          <label className="label" htmlFor="photos">Outras fotos (clínica, equipe, consultório) — até 6</label>
          <input id="photos" type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 6))} className="block text-sm" />
          {files.length > 0 && <p className="mt-1 text-xs text-slate-500">{files.length} foto(s) selecionada(s)</p>}
          <p className="mt-1 text-xs text-slate-500">Use apenas fotos que a clínica tem direito de usar. Fotos de pacientes exigem autorização por escrito.</p>
        </div>
      </section>

      <section className="card grid gap-4 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">3. Formatos</h2>
        <fieldset className="flex flex-wrap gap-4 text-sm">
          <legend className="label">Tamanhos</legend>
          <label className="flex items-center gap-2"><input type="checkbox" name="formats" value="feed" defaultChecked /> Feed 4:5</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="formats" value="story" defaultChecked /> Stories/Reels 9:16</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="formats" value="quadrado" /> Quadrado 1:1</label>
        </fieldset>
        <div><label className="label" htmlFor="variacoes">Variações</label><select id="variacoes" name="variacoes" defaultValue="3" className="field"><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option></select></div>
      </section>

      {err && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      <button type="submit" disabled={!!step} className="btn btn-lima w-full sm:w-auto">{step || 'Gerar criativos'}</button>
    </form>
  );
}
