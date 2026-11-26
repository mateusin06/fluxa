'use client';
import { aiJson } from '@/lib/ai-fetch';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { toPng } from 'html-to-image';
import { createClient } from '@/lib/supabase/client';
import { CreativeRender, SIZES, TEMPLATES, type Format } from '@/components/creative/templates';
import type { AdCopy, Brand, CreativeContent } from '@/lib/types';
import { saveCreative, setCreativeImage, archiveCreative } from '../actions';

export interface SCreative { id: string; format: Format; template: string; content: CreativeContent; ad_copy: AdCopy; compliance: string[]; status: string; bg: string | null }
interface Props {
  clinicId: string; clinicName: string; brand: Brand; logo: string | null; footer: string;
  photos: { url: string; proName?: string; proReg?: string }[]; creatives: SCreative[]; readOnly: boolean;
}

async function toDataUrl(url: string): Promise<string> {
  const r = await fetch(url);
  const b = await r.blob();
  return new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.readAsDataURL(b); });
}

function Scaled({ format, width, children }: { format: Format; width: number; children: React.ReactNode }) {
  const [W, H] = SIZES[format];
  const s = width / W;
  return (
    <div style={{ width, height: H * s, overflow: 'hidden', position: 'relative' }} className="rounded-lg shadow">
      <div style={{ transform: `scale(${s})`, transformOrigin: 'top left', width: W, height: H }}>{children}</div>
    </div>
  );
}

export function Studio(p: Props) {
  const [items, setItems] = useState(p.creatives);
  const [sel, setSel] = useState(p.creatives[0]?.id || '');
  const [data, setData] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const [, start] = useTransition();
  const exportRef = useRef<HTMLDivElement>(null);
  const cur = items.find((c) => c.id === sel);

  // Converte as imagens privadas em data URL (exportação confiável em PNG)
  useEffect(() => {
    const urls = [...p.photos.map((x) => x.url), p.logo, ...items.map((c) => c.bg)].filter((u): u is string => !!u && !data[u]);
    if (!urls.length) return;
    Promise.all(urls.map(async (u) => [u, await toDataUrl(u).catch(() => u)] as const)).then((pairs) =>
      setData((d) => ({ ...d, ...Object.fromEntries(pairs) })));
  }, [p.photos, p.logo, items, data]);

  const img = (u: string | null | undefined) => (u ? data[u] || u : null);
  const renderProps = (c: SCreative) => {
    const ph = c.content.fotoIndex >= 0 ? p.photos[c.content.fotoIndex] : undefined;
    return {
      content: c.content, format: c.format, template: c.template, brand: p.brand, photo: img(ph?.url), logo: img(p.logo), bg: img(c.bg),
      clinicName: p.clinicName, footer: c.content.rodape || p.footer, proName: ph?.proName, proReg: ph?.proReg,
    };
  };

  function patch(fn: (c: SCreative) => SCreative) {
    setItems((list) => list.map((c) => (c.id === sel ? fn(c) : c)));
  }
  const setC = (k: keyof CreativeContent, v: unknown) => patch((c) => ({ ...c, content: { ...c.content, [k]: v } }));
  const setA = (k: keyof AdCopy, v: string) => patch((c) => ({ ...c, ad_copy: { ...c.ad_copy, [k]: v } }));

  async function save() {
    if (!cur) return;
    setBusy('Salvando...');
    const r = await saveCreative({ id: cur.id, template: cur.template, content: cur.content, ad_copy: cur.ad_copy });
    setBusy(''); setMsg(r.error || 'Salvo.');
  }

  async function exportPng() {
    if (!cur || !exportRef.current) return;
    setBusy('Gerando PNG...');
    try {
      await save();
      const [W, H] = SIZES[cur.format];
      const url = await toPng(exportRef.current, { width: W, height: H, pixelRatio: 1, cacheBust: true });
      const a = document.createElement('a');
      a.href = url; a.download = `${p.clinicName.replace(/\W+/g, '-').toLowerCase()}-${cur.format}-${cur.id.slice(0, 6)}.png`; a.click();
      if (!p.readOnly) {
        const blob = await (await fetch(url)).blob();
        const path = `${p.clinicId}/artes/${crypto.randomUUID()}.png`;
        const up = await createClient().storage.from('clinic-files').upload(path, blob, { contentType: 'image/png' });
        if (up.error) throw new Error(up.error.message);
        const r = await setCreativeImage(cur.id, path);
        if (r.error) throw new Error(r.error);
        patch((c) => ({ ...c, status: 'aprovado' }));
      }
      setMsg('PNG baixado e salvo como aprovado.');
    } catch (e) { setMsg('Erro: ' + (e as Error).message); } finally { setBusy(''); }
  }

  async function aiBackground() {
    if (!cur) return;
    const d = window.prompt('Descreva o fundo (sem pessoas). Ex.: consultório odontológico moderno, claro, com plantas');
    if (!d) return;
    setBusy('A IA está criando o fundo...');
    try {
      const r = await fetch('/api/ai/image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ creativeId: cur.id, descricao: d }) });
      const j = await aiJson(r);
      if (!r.ok) throw new Error(j.error);
      patch((c) => ({ ...c, bg: j.url, template: 'tipografico' }));
      setMsg('Fundo criado. Ele aparece no modelo "Só texto".');
    } catch (e) { setMsg('Erro: ' + (e as Error).message); } finally { setBusy(''); }
  }

  const copyAll = useMemo(() => (cur ? `${cur.ad_copy.texto_principal}\n\nTítulo: ${cur.ad_copy.titulo}\nDescrição: ${cur.ad_copy.descricao}\nBotão: ${cur.ad_copy.cta}` : ''), [cur]);

  if (!items.length) return <p className="text-sm text-slate-600">Nenhuma arte neste briefing ainda.</p>;

  return (
    <div className="grid gap-6 xl:grid-cols-[220px_1fr_380px]">
      <nav aria-label="Artes" className="flex gap-3 overflow-x-auto xl:flex-col">
        {items.map((c, i) => (
          <button key={c.id} type="button" onClick={() => setSel(c.id)} aria-pressed={c.id === sel}
            className={`shrink-0 rounded-lg p-1 text-left ${c.id === sel ? 'ring-2 ring-ink' : 'ring-1 ring-slate-200'}`}>
            <Scaled format={c.format} width={150}><CreativeRender {...renderProps(c)} /></Scaled>
            <span className="mt-1 block px-1 text-xs text-slate-600">#{i + 1} · {c.format}{c.status === 'aprovado' ? ' · aprovada' : ''}</span>
          </button>
        ))}
      </nav>

      {cur && (
        <div className="flex flex-col items-center gap-3">
          <Scaled format={cur.format} width={cur.format === 'story' ? 340 : 440}><CreativeRender {...renderProps(cur)} /></Scaled>
          <div className="flex flex-wrap justify-center gap-2">
            {!p.readOnly && <button type="button" onClick={save} disabled={!!busy} className="btn btn-sec">Salvar</button>}
            <button type="button" onClick={exportPng} disabled={!!busy} className="btn btn-lima">Baixar PNG</button>
            {!p.readOnly && <button type="button" onClick={aiBackground} disabled={!!busy} className="btn btn-sec">Fundo com IA</button>}
            {!p.readOnly && <button type="button" onClick={() => start(async () => { await archiveCreative(cur.id); setItems((l) => l.filter((x) => x.id !== cur.id)); setSel(items.find((x) => x.id !== cur.id)?.id || ''); })} className="btn btn-danger">Descartar</button>}
          </div>
          <p role="status" className="text-sm text-slate-600">{busy || msg}</p>
          {/* Renderização em tamanho real, fora da tela, usada na exportação */}
          <div aria-hidden="true" style={{ position: 'fixed', left: -20000, top: 0 }}>
            <div ref={exportRef}><CreativeRender {...renderProps(cur)} /></div>
          </div>
        </div>
      )}

      {cur && (
        <aside className="space-y-4">
          <section className="card space-y-3">
            <h2 className="font-semibold">Arte</h2>
            <fieldset disabled={p.readOnly} className="space-y-3">
              <div><label className="label" htmlFor="tpl">Modelo</label><select id="tpl" value={cur.template} onChange={(e) => patch((c) => ({ ...c, template: e.target.value }))} className="field">{TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}</select></div>
              <div><label className="label" htmlFor="pal">Cores</label><select id="pal" value={cur.content.paleta} onChange={(e) => setC('paleta', e.target.value)} className="field"><option value="marca">Cor da marca</option><option value="escuro">Escuro</option><option value="claro">Claro</option></select></div>
              <div><label className="label" htmlFor="foto">Foto</label><select id="foto" value={cur.content.fotoIndex} onChange={(e) => setC('fotoIndex', Number(e.target.value))} className="field"><option value={-1}>Sem foto</option>{p.photos.map((f, i) => <option key={i} value={i}>{f.proName || `Foto ${i + 1}`}</option>)}</select></div>
              <div><label className="label" htmlFor="hl">Gancho</label><textarea id="hl" rows={2} value={cur.content.headline} onChange={(e) => setC('headline', e.target.value)} className="field" /></div>
              <div><label className="label" htmlFor="dq">Palavra em destaque</label><input id="dq" value={cur.content.destaque} onChange={(e) => setC('destaque', e.target.value)} className="field" /></div>
              <div><label className="label" htmlFor="sub">Subtítulo</label><textarea id="sub" rows={2} value={cur.content.subtitulo} onChange={(e) => setC('subtitulo', e.target.value)} className="field" /></div>
              <div><label className="label" htmlFor="bl">Itens da lista (um por linha)</label><textarea id="bl" rows={3} value={cur.content.bullets.join('\n')} onChange={(e) => setC('bullets', e.target.value.split('\n').slice(0, 4))} className="field" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="label" htmlFor="cta">Botão</label><input id="cta" value={cur.content.cta} onChange={(e) => setC('cta', e.target.value)} className="field" /></div>
                <div><label className="label" htmlFor="selo">Selo</label><input id="selo" value={cur.content.selo} onChange={(e) => setC('selo', e.target.value)} className="field" /></div>
              </div>
              <div><label className="label" htmlFor="rod">Rodapé</label><input id="rod" value={cur.content.rodape || p.footer} onChange={(e) => setC('rodape', e.target.value)} className="field" /></div>
            </fieldset>
          </section>
          <section className="card space-y-3">
            <div className="flex items-center justify-between"><h2 className="font-semibold">Texto do anúncio</h2><button type="button" className="text-sm underline" onClick={() => navigator.clipboard.writeText(copyAll)}>Copiar tudo</button></div>
            <fieldset disabled={p.readOnly} className="space-y-3">
              <div><label className="label" htmlFor="tp">Texto principal</label><textarea id="tp" rows={7} value={cur.ad_copy.texto_principal} onChange={(e) => setA('texto_principal', e.target.value)} className="field" /></div>
              <div><label className="label" htmlFor="tt">Título</label><input id="tt" value={cur.ad_copy.titulo} onChange={(e) => setA('titulo', e.target.value)} className="field" /></div>
              <div><label className="label" htmlFor="ds">Descrição</label><input id="ds" value={cur.ad_copy.descricao} onChange={(e) => setA('descricao', e.target.value)} className="field" /></div>
              <p className="text-sm">Botão na Meta: <b>{cur.ad_copy.cta}</b></p>
            </fieldset>
          </section>
          {cur.compliance?.length > 0 && (
            <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              <h2 className="mb-1 font-semibold">Revise antes de publicar</h2>
              <ul className="list-disc space-y-1 pl-5">{cur.compliance.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </section>
          )}
        </aside>
      )}
    </div>
  );
}
