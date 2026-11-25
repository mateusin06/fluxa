import 'server-only';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fmtPhone } from '@/lib/utils';

/** Só caracteres que a fonte padrão do PDF (WinAnsi) desenha; o resto vira "-". */
const OK = new Set('–—‘’“”•…€'.split(''));
export const safe = (s: unknown) => [...String(s ?? '')].map((ch) => {
  const c = ch.charCodeAt(0);
  return ch === '\r' ? '' : (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || OK.has(ch) || ch === '\n' ? ch : '-';
}).join('');

export const brl = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ---------------------------------------------------------------- valor por extenso
const U = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const D = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const C = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
function ate999(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100), r = n % 100, parts: string[] = [];
  if (c) parts.push(C[c]);
  if (r) parts.push(r < 20 ? U[r] : D[Math.floor(r / 10)] + (r % 10 ? ' e ' + U[r % 10] : ''));
  return parts.join(' e ');
}
function inteiro(n: number): string {
  if (n === 0) return 'zero';
  const groups: { v: number; s: string; p: string }[] = [
    { v: Math.floor(n / 1e9) % 1000, s: 'bilhão', p: 'bilhões' },
    { v: Math.floor(n / 1e6) % 1000, s: 'milhão', p: 'milhões' },
    { v: Math.floor(n / 1e3) % 1000, s: 'mil', p: 'mil' },
    { v: n % 1000, s: '', p: '' },
  ];
  const parts = groups.filter((g) => g.v).map((g) => (g.s === 'mil' && g.v === 1 ? 'mil' : ate999(g.v) + (g.s ? ' ' + (g.v === 1 ? g.s : g.p) : '')));
  const last = groups[3].v;
  // "mil e quinhentos", "mil e vinte"; mas "mil cento e vinte"
  if (parts.length > 1 && last && (last < 100 || last % 100 === 0)) return parts.slice(0, -1).join(' ') + ' e ' + parts[parts.length - 1];
  return parts.join(' ');
}
/** 1234.5 → "mil, duzentos e trinta e quatro reais e cinquenta centavos" */
export function extenso(v: number): string {
  const cents = Math.round(v * 100), r = Math.floor(cents / 100), c = cents % 100;
  const rs = r ? `${inteiro(r)}${r >= 1e6 && r % 1e6 === 0 ? ' de' : ''} ${r === 1 ? 'real' : 'reais'}` : '';
  const cs = c ? `${inteiro(c)} ${c === 1 ? 'centavo' : 'centavos'}` : '';
  return [rs, cs].filter(Boolean).join(' e ') || 'zero reais';
}

// ---------------------------------------------------------------- escritor simples (A4, de cima para baixo)
export class Writer {
  doc!: PDFDocument; page!: PDFPage; font!: PDFFont; bold!: PDFFont;
  y = 0; readonly W = 595.28; readonly H = 841.89; readonly M = 50;
  static async create() {
    const w = new Writer();
    w.doc = await PDFDocument.create();
    w.font = await w.doc.embedFont(StandardFonts.Helvetica);
    w.bold = await w.doc.embedFont(StandardFonts.HelveticaBold);
    w.newPage();
    return w;
  }
  newPage() { this.page = this.doc.addPage([this.W, this.H]); this.y = this.H - this.M; }
  need(h: number) { if (this.y - h < this.M) this.newPage(); }
  lines(text: string, size: number, f: PDFFont, width: number) {
    const out: string[] = [];
    for (const para of safe(text).split(/\r?\n/)) {
      let cur = '';
      for (const w of para.split(/\s+/)) {
        const t = cur ? cur + ' ' + w : w;
        if (f.widthOfTextAtSize(t, size) > width && cur) { out.push(cur); cur = w; } else cur = t;
      }
      out.push(cur);
    }
    return out;
  }
  text(t: string, o: { size?: number; bold?: boolean; color?: [number, number, number]; x?: number; width?: number; align?: 'left' | 'right' | 'center'; gap?: number } = {}) {
    const size = o.size ?? 10, f = o.bold ? this.bold : this.font, x = o.x ?? this.M, width = o.width ?? this.W - this.M - x;
    for (const ln of this.lines(t, size, f, width)) {
      this.need(size * 1.4);
      const tw = f.widthOfTextAtSize(ln, size);
      const dx = o.align === 'right' ? width - tw : o.align === 'center' ? (width - tw) / 2 : 0;
      this.page.drawText(ln, { x: x + dx, y: this.y - size, size, font: f, color: rgb(...(o.color ?? [0.1, 0.12, 0.16])) });
      this.y -= size * 1.4;
    }
    this.y -= o.gap ?? 0;
  }
  /** Linha com várias colunas na mesma altura: [texto, x, largura, alinhamento, negrito]. */
  row(cols: [string, number, number, ('left' | 'right')?, boolean?][], size = 10) {
    const hs = cols.map(([t, , w, , b]) => this.lines(t, size, b ? this.bold : this.font, w).length);
    const h = Math.max(...hs) * size * 1.4;
    this.need(h);
    const y0 = this.y;
    for (const [t, x, w, al, b] of cols) { this.y = y0; this.text(t, { size, x, width: w, align: al, bold: b }); }
    this.y = y0 - h;
  }
  hr(gap = 8) { this.need(gap * 2); this.y -= gap; this.page.drawLine({ start: { x: this.M, y: this.y }, end: { x: this.W - this.M, y: this.y }, thickness: 0.6, color: rgb(0.8, 0.82, 0.86) }); this.y -= gap; }
  space(h: number) { this.y -= h; }
  async save() { return this.doc.save(); }
}

/** Cabeçalho com logo (PNG/JPG) e dados da clínica. */
export async function clinicHeader(w: Writer, db: SupabaseClient, c: { name: string; document: string | null; address: string | null; city: string | null; state: string | null; phone: string | null; whatsapp: string | null; email: string | null; logo_path: string | null }) {
  let logoW = 0;
  if (c.logo_path && /\.(png|jpe?g)$/i.test(c.logo_path)) {
    try {
      const { data } = await db.storage.from('clinic-files').download(c.logo_path);
      if (data) {
        const bytes = new Uint8Array(await data.arrayBuffer());
        const img = /\.png$/i.test(c.logo_path) ? await w.doc.embedPng(bytes) : await w.doc.embedJpg(bytes);
        const s = img.scaleToFit(110, 50);
        w.page.drawImage(img, { x: w.M, y: w.y - s.height, width: s.width, height: s.height });
        logoW = s.width + 14;
      }
    } catch { /* sem logo */ }
  }
  const y0 = w.y;
  w.text(c.name, { size: 15, bold: true, x: w.M + logoW });
  const info = [c.document && `CNPJ/CPF ${c.document}`, [c.address, [c.city, c.state].filter(Boolean).join('/')].filter(Boolean).join(' · '), [fmtPhone(c.whatsapp || c.phone), c.email].filter(Boolean).join(' · ')].filter(Boolean).join('\n');
  if (info) w.text(info, { size: 9, x: w.M + logoW, color: [0.35, 0.38, 0.45] });
  w.y = Math.min(w.y, y0 - 52);
  w.hr(6);
}

export function pdfResponse(bytes: Uint8Array, filename: string) {
  return new Response(Buffer.from(bytes), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${filename.replace(/[^\w.-]/g, '_')}"`, 'Cache-Control': 'private, no-store' },
  });
}
