import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

const p2 = (n: number) => String(n).padStart(2, '0');
/** ISO -> "AAAA-MM-DD HH:mm" (Brasília), o formato que o C2a entende. */
function br(iso: string) {
  const d = new Date(new Date(iso).getTime() - 3 * 3600000);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
}

/**
 * Consulta futura cancelada pelo sistema → avisa o fluxo de lista de espera (C2a) da clínica,
 * que oferece a vaga ao primeiro da fila pelo WhatsApp. Só se a clínica cadastrou o webhook
 * em Configurações e há alguém aguardando. Nunca derruba a ação de quem cancelou.
 */
export async function notifyWaitlist(db: SupabaseClient, cid: string, appointmentId: string): Promise<'enviado' | 'sem_webhook' | 'sem_fila' | 'passado' | 'erro'> {
  try {
    const [{ data: c }, { data: a }] = await Promise.all([
      db.from('clinics').select('waitlist_webhook_url').eq('id', cid).single(),
      db.from('appointments').select('starts_at, procedure_text, procedure:procedures(name), professional:professionals(name)').eq('id', appointmentId).eq('clinic_id', cid).single(),
    ]);
    const url = (c?.waitlist_webhook_url as string | null) || '';
    if (!url) return 'sem_webhook';
    if (!a || new Date(a.starts_at).getTime() < Date.now()) return 'passado';
    const { count } = await db.from('waitlist').select('id', { count: 'exact', head: true }).eq('clinic_id', cid).eq('status', 'aguardando');
    if (!count) return 'sem_fila';
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data_hora: br(a.starts_at),
        procedimento: (a.procedure as unknown as { name: string } | null)?.name || a.procedure_text || '',
        profissional: (a.professional as unknown as { name: string } | null)?.name || '',
        origem: 'sistema',
      }),
      signal: AbortSignal.timeout(8000),
    });
    return r.ok ? 'enviado' : 'erro';
  } catch {
    return 'erro';
  }
}
