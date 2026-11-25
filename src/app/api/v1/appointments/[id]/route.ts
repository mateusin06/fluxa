import { NextResponse } from 'next/server';
import { z } from 'zod';
import { v1 } from '@/lib/v1';
import { notifyWaitlist } from '@/lib/waitlist';

// PATCH { status } — ex.: paciente tocou "Confirmo" no WhatsApp
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await v1(req); if ('error' in a) return a.error;
  const { id } = await params;
  const b = z.object({ status: z.enum(['agendado', 'confirmado', 'realizado', 'faltou', 'cancelado']), note: z.string().max(500).optional() }).safeParse(await req.json().catch(() => ({})));
  if (!b.success || !z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 });
  const { data: before } = await a.db.from('appointments').select('status').eq('id', id).eq('clinic_id', a.clinicId).maybeSingle();
  const { data, error } = await a.db.from('appointments').update({ status: b.data.status }).eq('id', id).eq('clinic_id', a.clinicId).select('id, contact_id').maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Consulta não encontrada' }, { status: 404 });
  await a.db.from('activities').insert({ clinic_id: a.clinicId, contact_id: data.contact_id, type: 'sistema', body: `Consulta marcada como ${b.data.status} pela automação${b.data.note ? ': ' + b.data.note : ''}` });
  // vaga liberada: avisa a lista de espera (?avisar_espera=nao quando a automação já avisa sozinha)
  let espera: string | undefined;
  if (b.data.status === 'cancelado' && before?.status !== 'cancelado' && new URL(req.url).searchParams.get('avisar_espera') !== 'nao') espera = await notifyWaitlist(a.db, a.clinicId, id);
  return NextResponse.json({ ok: true, espera });
}
