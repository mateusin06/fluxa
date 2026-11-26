import type { Brand, CreativeContent } from '@/lib/types';

export const SIZES = { feed: [1080, 1350], story: [1080, 1920], quadrado: [1080, 1080] } as const;
export type Format = keyof typeof SIZES;
export const TEMPLATES = [
  { id: 'destaque', nome: 'Foto em destaque' },
  { id: 'lateral', nome: 'Foto lateral' },
  { id: 'lista', nome: 'Lista de benefícios' },
  { id: 'autoridade', nome: 'Autoridade do profissional' },
  { id: 'tipografico', nome: 'Texto sobre o fundo' },
] as const;
export type TemplateId = (typeof TEMPLATES)[number]['id'];

export interface RenderProps {
  content: CreativeContent; format: Format; template: string; brand: Brand;
  photo?: string | null; logo?: string | null; bg?: string | null;
  clinicName: string; footer: string; proName?: string; proReg?: string;
}

function palette(c: CreativeContent, b: Brand) {
  if (c.paleta === 'claro') return { bg: '#F8FAFC', fg: '#0F172A', sub: '#334155', acc: b.primary, btn: b.primary, btnFg: '#FFFFFF' };
  if (c.paleta === 'escuro') return { bg: b.dark || '#0A0F1C', fg: '#F8FAFC', sub: '#CBD5E1', acc: b.accent, btn: b.accent, btnFg: b.dark || '#0A0F1C' };
  return { bg: b.primary, fg: '#FFFFFF', sub: 'rgba(255,255,255,.85)', acc: b.accent, btn: '#FFFFFF', btnFg: b.primary };
}

/** Cor com transparência a partir de #RGB/#RRGGBB (para os degradês sobre o fundo de IA). */
function rgba(hex: string, a: number) {
  const h = hex.replace('#', '');
  const f = h.length === 3 ? h.split('').map((x) => x + x).join('') : h.slice(0, 6);
  if (!/^[0-9a-f]{6}$/i.test(f)) return `rgba(10,15,28,${a})`;
  return `rgba(${parseInt(f.slice(0, 2), 16)},${parseInt(f.slice(2, 4), 16)},${parseInt(f.slice(4, 6), 16)},${a})`;
}

/** Imagem de fundo ocupando tudo + degradê na cor da paleta para o texto ficar legível. */
function Backdrop({ src, color, dir = '180deg', from = 0.35, mid = 0.72, to = 0.94 }: { src: string; color: string; dir?: string; from?: number; mid?: number; to?: number }) {
  return (
    <>
      <img src={src} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(${dir}, ${rgba(color, from)} 0%, ${rgba(color, mid)} 48%, ${rgba(color, to)} 100%)` }} />
    </>
  );
}

function Headline({ c, color, acc, size, shadow }: { c: CreativeContent; color: string; acc: string; size: number; shadow?: boolean }) {
  const h = c.headline || '';
  const d = (c.destaque || '').trim();
  const i = d ? h.toLowerCase().indexOf(d.toLowerCase()) : -1;
  return (
    <h1 style={{ margin: 0, fontFamily: '"Space Grotesk", Inter, sans-serif', fontWeight: 700, fontSize: size, lineHeight: 1.05, letterSpacing: '-0.015em', color, textShadow: shadow ? '0 2px 24px rgba(0,0,0,.18)' : undefined }}>
      {i < 0 ? h : (<>{h.slice(0, i)}<span style={{ color: acc }}>{h.slice(i, i + d.length)}</span>{h.slice(i + d.length)}</>)}
    </h1>
  );
}

function Cta({ text, bg, fg }: { text: string; bg: string; fg: string }) {
  return <div style={{ alignSelf: 'flex-start', background: bg, color: fg, borderRadius: 999, padding: '26px 44px', fontWeight: 700, fontSize: 38, fontFamily: '"Space Grotesk", Inter, sans-serif', boxShadow: '0 14px 34px rgba(0,0,0,.20)' }}>{text} →</div>;
}

function Footer({ logo, name, text, color }: { logo?: string | null; name: string; text: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, color, fontSize: 24, lineHeight: 1.3 }}>
      {logo ? <img src={logo} alt="" style={{ height: 64, maxWidth: 220, objectFit: 'contain' }} /> : <b style={{ fontSize: 30 }}>{name}</b>}
      {text && <span style={{ opacity: 0.85 }}>{text}</span>}
    </div>
  );
}

const Selo = ({ t, bg, fg }: { t: string; bg: string; fg: string }) =>
  t ? <span style={{ alignSelf: 'flex-start', background: bg, color: fg, borderRadius: 12, padding: '10px 20px', fontSize: 28, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' }}>{t}</span> : null;

export function CreativeRender(p: RenderProps) {
  const [W, H] = SIZES[p.format];
  const c = p.content;
  const pal = palette(c, p.brand);
  const tall = p.format === 'story';
  const base: React.CSSProperties = { width: W, height: H, position: 'relative', overflow: 'hidden', background: pal.bg, color: pal.fg, fontFamily: 'Inter, sans-serif', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' };
  const pad = tall ? 90 : 72;
  // Espaço da foto: foto do profissional/clínica; sem foto, o fundo de IA; sem os dois, degradê da marca
  const mediaSrc = p.photo || p.bg;
  const photo = mediaSrc
    ? <img src={mediaSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
    : <div style={{ width: '100%', height: '100%', background: `radial-gradient(120% 90% at 20% 10%, ${rgba(pal.acc, 0.55)} 0%, transparent 60%), linear-gradient(135deg, ${rgba(p.brand.primary, 1)} 0%, ${rgba(p.brand.dark || '#0A0F1C', 1)} 100%)` }} />;
  // Fundo de IA atrás do painel de texto quando a foto já ocupa o espaço dela
  const panelBg = p.photo && p.bg ? p.bg : null;

  if (p.template === 'lateral') {
    return (
      <div style={{ ...base, flexDirection: 'row' }}>
        <div style={{ flex: '0 0 56%', padding: pad, display: 'flex', flexDirection: 'column', gap: 36, justifyContent: 'center', position: 'relative', zIndex: 1, background: `linear-gradient(90deg, ${pal.bg} 78%, ${rgba(pal.bg, 0)} 100%)`, marginRight: -80 }}>
          <Selo t={c.selo} bg={pal.acc} fg={pal.bg} />
          <Headline c={c} color={pal.fg} acc={pal.acc} size={tall ? 96 : 80} />
          {c.subtitulo && <p style={{ margin: 0, fontSize: 36, lineHeight: 1.35, color: pal.sub }}>{c.subtitulo}</p>}
          <Cta text={c.cta} bg={pal.btn} fg={pal.btnFg} />
          <div style={{ marginTop: 'auto' }}><Footer logo={p.logo} name={p.clinicName} text={p.footer} color={pal.sub} /></div>
        </div>
        <div style={{ flex: 1 }}>{photo}</div>
      </div>
    );
  }

  if (p.template === 'lista') {
    return (
      <div style={{ ...base, padding: pad, gap: 44 }}>
        {p.bg && <Backdrop src={p.bg} color={pal.bg} from={0.6} mid={0.8} to={0.95} />}
        <div style={{ position: 'relative' }}><Footer logo={p.logo} name={p.clinicName} text="" color={pal.sub} /></div>
        <div style={{ position: 'relative' }}><Headline c={c} color={pal.fg} acc={pal.acc} size={tall ? 104 : 84} shadow={!!p.bg} /></div>
        <ul style={{ position: 'relative', listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 26 }}>
          {(c.bullets || []).slice(0, 4).map((b, i) => (
            <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 24, fontSize: 40, fontWeight: 600 }}>
              <span style={{ width: 54, height: 54, borderRadius: 999, background: pal.acc, color: pal.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, flex: 'none' }}>✓</span>{b}
            </li>
          ))}
        </ul>
        <div style={{ position: 'relative', marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 28 }}>
          {p.photo && <div style={{ width: 170, height: 170, borderRadius: 999, overflow: 'hidden', flex: 'none', border: `6px solid ${pal.acc}` }}>{photo}</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <Cta text={c.cta} bg={pal.btn} fg={pal.btnFg} />
            {p.footer && <span style={{ fontSize: 24, color: pal.sub }}>{p.footer}</span>}
          </div>
        </div>
      </div>
    );
  }

  if (p.template === 'autoridade') {
    return (
      <div style={{ ...base }}>
        <div style={{ height: tall ? '52%' : '50%', position: 'relative' }}>{photo}<div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, transparent 62%, ${pal.bg} 100%)` }} /></div>
        <div style={{ flex: 1, padding: pad, paddingTop: 56, display: 'flex', flexDirection: 'column', gap: 30, position: 'relative' }}>
          {panelBg && <Backdrop src={panelBg} color={pal.bg} from={0.9} mid={0.92} to={0.96} />}
          {p.proName && <p style={{ position: 'relative', margin: 0, fontSize: 32, fontWeight: 700, color: pal.acc }}>{p.proName}{p.proReg ? ` · ${p.proReg}` : ''}</p>}
          <div style={{ position: 'relative' }}><Headline c={c} color={pal.fg} acc={pal.acc} size={tall ? 92 : 72} /></div>
          {c.subtitulo && <p style={{ position: 'relative', margin: 0, fontSize: 34, lineHeight: 1.35, color: pal.sub }}>{c.subtitulo}</p>}
          <div style={{ position: 'relative', marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 24 }}>
            <Cta text={c.cta} bg={pal.btn} fg={pal.btnFg} />
            <Footer logo={p.logo} name={p.clinicName} text="" color={pal.sub} />
          </div>
          {p.footer && <span style={{ position: 'relative', fontSize: 22, color: pal.sub }}>{p.footer}</span>}
        </div>
      </div>
    );
  }

  if (p.template === 'tipografico') {
    return (
      <div style={{ ...base, padding: pad, gap: 48, justifyContent: 'center' }}>
        {p.bg ? <Backdrop src={p.bg} color={pal.bg} from={0.15} mid={0.6} to={0.92} />
          : <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(90% 70% at 85% 10%, ${rgba(pal.acc, 0.35)} 0%, transparent 60%)` }} />}
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 48, flex: 1, justifyContent: 'center' }}>
          <Selo t={c.selo} bg={pal.acc} fg={pal.bg} />
          <Headline c={c} color={pal.fg} acc={pal.acc} size={tall ? 124 : 104} shadow={!!p.bg} />
          {c.subtitulo && <p style={{ margin: 0, fontSize: 42, lineHeight: 1.35, color: pal.sub }}>{c.subtitulo}</p>}
          <Cta text={c.cta} bg={pal.btn} fg={pal.btnFg} />
        </div>
        <div style={{ position: 'relative' }}><Footer logo={p.logo} name={p.clinicName} text={p.footer} color={pal.sub} /></div>
      </div>
    );
  }

  // destaque (padrão)
  return (
    <div style={{ ...base }}>
      <div style={{ height: tall ? '55%' : '52%', position: 'relative' }}>
        {photo}
        <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, transparent 60%, ${pal.bg} 100%)` }} />
        {c.selo && <div style={{ position: 'absolute', left: pad, top: pad }}><Selo t={c.selo} bg={pal.acc} fg={pal.bg} /></div>}
      </div>
      <div style={{ flex: 1, padding: pad, paddingTop: 54, display: 'flex', flexDirection: 'column', gap: 30, position: 'relative' }}>
        {panelBg && <Backdrop src={panelBg} color={pal.bg} from={0.9} mid={0.92} to={0.96} />}
        <div style={{ position: 'relative' }}><Headline c={c} color={pal.fg} acc={pal.acc} size={tall ? 96 : 76} /></div>
        {c.subtitulo && <p style={{ position: 'relative', margin: 0, fontSize: 34, lineHeight: 1.35, color: pal.sub }}>{c.subtitulo}</p>}
        <div style={{ position: 'relative', marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24 }}>
          <Cta text={c.cta} bg={pal.btn} fg={pal.btnFg} />
        </div>
        <div style={{ position: 'relative' }}><Footer logo={p.logo} name={p.clinicName} text={p.footer} color={pal.sub} /></div>
      </div>
    </div>
  );
}
