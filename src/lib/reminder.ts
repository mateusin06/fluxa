/** Mensagem do lembrete de consulta enviado à mão pelo WhatsApp (plano sem automações). */
export const DEFAULT_REMINDER =
  'Olá, {nome}! Passando para lembrar da sua consulta na {clinica} {dia} às {hora}{procedimento}. Você confirma? Se precisar remarcar, é só responder aqui.';

export const REMINDER_VARS = ['{nome}', '{clinica}', '{dia}', '{hora}', '{procedimento}', '{profissional}'];

const WD = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

export function renderReminder(tpl: string | null | undefined, v: { nome: string; clinica: string; startsAt: string; procedimento?: string | null; profissional?: string | null }) {
  const d = new Date(new Date(v.startsAt).getTime() - 3 * 3600000);
  const now = new Date(Date.now() - 3 * 3600000);
  const sameDay = (a: Date, b: Date) => a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
  const tomorrow = new Date(now.getTime() + 86400000);
  const dd = `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  const dia = sameDay(d, now) ? `hoje (${dd})` : sameDay(d, tomorrow) ? `amanhã (${WD[d.getUTCDay()]}, ${dd})` : `${WD[d.getUTCDay()]}, ${dd}`;
  const hora = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  const first = (v.nome || '').trim().split(/\s+/)[0] || '';
  return (tpl?.trim() || DEFAULT_REMINDER)
    .replaceAll('{nome}', first)
    .replaceAll('{clinica}', v.clinica)
    .replaceAll('{dia}', dia)
    .replaceAll('{hora}', hora)
    .replaceAll('{procedimento}', v.procedimento ? ` (${v.procedimento})` : '')
    .replaceAll('{profissional}', v.profissional || '');
}
