/** Formas de pagamento (usadas em cobranças, despesas, orçamentos e recibos). */
export const METHODS = [
  ['pix', 'Pix'],
  ['dinheiro', 'Dinheiro'],
  ['credito', 'Cartão de crédito'],
  ['debito', 'Cartão de débito'],
  ['boleto', 'Boleto'],
  ['transferencia', 'Transferência'],
  ['outro', 'Outro'],
] as const;
export type Method = (typeof METHODS)[number][0];
export const METHOD_KEYS = METHODS.map(([k]) => k) as [Method, ...Method[]];
export const methodLabel = (m: string | null | undefined) => METHODS.find(([k]) => k === m)?.[1] || '';

export const EXPENSE_CATEGORIES = [
  ['aluguel', 'Aluguel e condomínio'],
  ['material', 'Material e insumos'],
  ['laboratorio', 'Laboratório / prótese'],
  ['salarios', 'Salários e pró-labore'],
  ['comissao', 'Comissões'],
  ['impostos', 'Impostos e taxas'],
  ['marketing', 'Marketing e anúncios'],
  ['servicos', 'Serviços (contador, sistemas, limpeza)'],
  ['outros', 'Outros'],
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number][0];
export const EXPENSE_KEYS = EXPENSE_CATEGORIES.map(([k]) => k) as [ExpenseCategory, ...ExpenseCategory[]];
export const categoryLabel = (c: string | null | undefined) => EXPENSE_CATEGORIES.find(([k]) => k === c)?.[1] || 'Outros';

/** "1.234,56" / "1234.56" / "R$ 250" -> número; null se vazio; NaN se inválido. */
export function parseMoney(v: unknown): number | null {
  const t = String(v ?? '').trim().replace(/[R$\s]/g, '');
  if (!t) return null;
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN;
}

/** Mês "AAAA-MM" (Brasília) → limites em ISO UTC. */
export function monthBounds(ym?: string | null) {
  const now = new Date(Date.now() - 3 * 3600000);
  const m = ym && /^\d{4}-\d{2}$/.test(ym) ? ym : `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const [y, mo] = m.split('-').map(Number);
  const start = new Date(Date.UTC(y, mo - 1, 1, 3));
  const end = new Date(Date.UTC(y, mo, 1, 3));
  const prev = new Date(Date.UTC(y, mo - 2, 1)), next = new Date(Date.UTC(y, mo, 1));
  const ymOf = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  const l0 = start.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });
  const label = l0.charAt(0).toUpperCase() + l0.slice(1);
  return { ym: m, start: start.toISOString(), end: end.toISOString(), startDate: `${m}-01`, endDate: ymOf(next) + '-01', prev: ymOf(prev), next: ymOf(next), label };
}
