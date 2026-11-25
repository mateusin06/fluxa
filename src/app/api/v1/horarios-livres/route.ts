import { NextResponse } from 'next/server';
import { v1 } from '@/lib/v1';
import { loadSchedule, nextFreePro } from '@/lib/schedule';
import { fmtDT } from '@/lib/planilha';

// GET ?procedimento=Limpeza&profissional=Dra. Ana&dias=7&limite=20
// → próximos horários livres (do horário de atendimento de cada profissional, menos o que já está ocupado)
export async function GET(req: Request) {
  const a = await v1(req); if ('error' in a) return a.error;
  const u = new URL(req.url);
  const sc = await loadSchedule(a.db, a.clinicId);
  let dur = sc.slotMin, proc = sc.slotProc?.name || null, procId = sc.slotProc?.id || null;
  const name = (u.searchParams.get('procedimento') || '').trim();
  if (name) {
    const { data } = await a.db.from('procedures').select('id, name, duration_min').eq('clinic_id', a.clinicId).ilike('name', name).limit(1);
    if (data?.length) { dur = data[0].duration_min; proc = data[0].name; procId = data[0].id; }
  }
  const pn = (u.searchParams.get('profissional') || '').trim().toLocaleLowerCase('pt-BR');
  const pro = pn ? sc.pros.find((p) => p.name.toLocaleLowerCase('pt-BR') === pn) : null;
  if (pn && !pro) return NextResponse.json({ error: 'Profissional não encontrado ou não atende na agenda' }, { status: 404 });
  const dias = Math.min(90, Math.max(1, Number(u.searchParams.get('dias')) || sc.daysAhead));
  const limite = Math.min(500, Math.max(1, Number(u.searchParams.get('limite')) || 50));
  const list = await nextFreePro(a.db, a.clinicId, sc, { to: Date.now() + dias * 86400000, durMin: dur, limit: limite, procId, proId: pro?.id });
  const proName = new Map(sc.pros.map((p) => [p.id, p.name]));
  return NextResponse.json({
    procedimento: proc, duracao_min: dur, capacidade: sc.capacity,
    data: list.map(({ t, pro: p }) => ({ inicio: new Date(t).toISOString(), fim: new Date(t + dur * 60000).toISOString(), data_hora: fmtDT(new Date(t).toISOString()), profissional: p ? proName.get(p) || '' : '' })),
    aviso: sc.hasHours ? undefined : 'A clínica ainda não cadastrou o horário de atendimento.',
  });
}
