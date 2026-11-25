export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/** Normaliza telefone brasileiro para DDI+DDD+número (5519999990000). */
export function normPhone(raw: string | null | undefined): string | null {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 10 || d.length === 11) d = '55' + d;
  if (d.length === 12 && d.startsWith('55') && /^[6-9]/.test(d.slice(4))) d = d.slice(0, 4) + '9' + d.slice(4);
  return d.length >= 12 && d.length <= 13 ? d : null;
}

export const fmtPhone = (p: string | null) => {
  if (!p) return '';
  const d = p.replace(/^55/, '');
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : p;
};

export const money = (v: number | null | undefined) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const TZ = 'America/Sao_Paulo';
export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: TZ }) : '';
export const fmtDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });

/** Converte "2026-11-25T14:00" (horário de Brasília) em ISO UTC. */
export function localToIso(local: string): string {
  return new Date(local + ':00-03:00').toISOString();
}
/** ISO → valor de <input type="datetime-local"> em Brasília. */
export function isoToLocal(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 3 * 3600 * 1000);
  return d.toISOString().slice(0, 16);
}

export const waLink = (phone: string | null, text = '') =>
  phone ? `https://wa.me/${phone}${text ? `?text=${encodeURIComponent(text)}` : ''}` : '#';

export const firstName = (n: string) => (n || '').trim().split(/\s+/)[0] || '';
