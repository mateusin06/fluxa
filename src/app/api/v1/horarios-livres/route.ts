import { NextResponse } from 'next/server';
import { v1 } from '@/lib/v1';
import { loadSchedule, nextFree } from '@/lib/schedule';
import { fmtDT } from '@/lib/planilha';

// GET ?procedimento=Limpeza&dias=7&limite=20  → próximos horários livres (do horário de atendimento, menos o que já está ocupado)
export async function GET(req: Request) {
  const a = await v1(req); if ('error' in a) return a.error;
  const u = new URL(req.url);
  const sc = await loadSchedule(a.db, a.clinicId);
  let dur = sc.slotMin, proc = sc.slotProc?.name || null;
  const name = (u.searchParams.get('procedimento') || '').trim();
  if (name) {
    const { data } = await a.db.from('procedures').select('name, duration_min').eq('clinic_id', a.clinicId).ilike('name', name).limit(1);
    if (data?.length) { dur = data[0].duration_min; proc = data[0].name; }
  }
  const dias = Math.min(90, Math.max(1, Number(u.searchParams.get('dias')) || sc.daysAhead));
  const limite = Math.min(500, Math.max(1, Number(u.searchParams.get('limite')) || 50));
  const list = await nextFree(a.db, a.clinicId, sc, { to: Date.now() + dias * 86400000, durMin: dur, limit: limite });
  return NextResponse.json({
    procedimento: proc, duracao_min: dur, capacidade: sc.capacity,
    data: list.map((t) => ({ inicio: new Date(t).toISOString(), fim: new Date(t + dur * 60000).toISOString(), data_hora: fmtDT(new Date(t).toISOString()) })),
    aviso: sc.hours.length ? undefined : 'A clínica ainda não cadastrou o horário de atendimento.',
  });
}
