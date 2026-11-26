/** Convênios: nomes comparados sem acento, maiúsculas e espaços extras ("Amil Dental" = "amil  dental"). */
export const insKey = (s: string | null | undefined) =>
  String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Lista de convênios digitada em Configurações (um por linha ou separados por vírgula). */
export function parseInsurances(text: string): string[] {
  const seen = new Set<string>();
  return text.split(/[\n,;]+/).map((s) => s.trim().replace(/\s+/g, ' ').slice(0, 80)).filter((s) => {
    const k = insKey(s);
    if (!k || seen.has(k) || ['particular', 'nenhum', 'nao', 'sem convenio'].includes(k)) return false;
    seen.add(k); return true;
  }).slice(0, 60);
}

export interface InsClinic { accepts_insurance?: boolean | null; insurances?: string[] | null }

/** Nome do convênio como a clínica cadastrou, se ela atende esse convênio; senão null. */
export function acceptedInsurance(c: InsClinic, name: string | null | undefined): string | null {
  if (!c.accepts_insurance || !name) return null;
  const k = insKey(name);
  if (!k) return null;
  return (c.insurances || []).find((x) => insKey(x) === k) || null;
}

/** "Particular", "particular", "não tenho", "" → sem convênio. */
export function cleanInsurance(name: string | null | undefined): string | null {
  const s = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  const k = insKey(s);
  if (!k || /^(particular|nenhum|nao( tenho)?|sem( convenio| plano)?|-)$/.test(k)) return null;
  return s;
}

/**
 * Quem paga a consulta. explicit: 'particular' | 'convenio' | '' (automático).
 * Automático: convênio do paciente, se a clínica atende esse convênio; senão particular.
 */
export function decidePayer(c: InsClinic, contactInsurance: string | null | undefined, explicit?: string | null, explicitName?: string | null) {
  if (explicit === 'particular') return { payer: 'particular' as const, insurance: null };
  const name = acceptedInsurance(c, cleanInsurance(explicitName) || contactInsurance);
  if (explicit === 'convenio') {
    if (!name) return { payer: 'particular' as const, insurance: null, error: 'Esse paciente não tem um convênio que a clínica atende. Cadastre o convênio no paciente ou em Clínica e equipe.' };
    return { payer: 'convenio' as const, insurance: name };
  }
  return name ? { payer: 'convenio' as const, insurance: name } : { payer: 'particular' as const, insurance: null };
}
