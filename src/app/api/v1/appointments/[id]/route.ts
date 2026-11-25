import { NextResponse } from 'next/server';
import { z } from 'zod';
import { v1 } from '@/lib/v1';

// PATCH { status } — ex.: paciente tocou "Confirmo" no WhatsApp
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await v1(req); if ('error' in a) return a.error;
  const { id } = await params;
  const b = z.object({ status: z.enum(['agendado', 'confirmado', 'realizado', 'faltou', 'cancelado']), note: z.string().max(500).optional() }).safeParse(await req.json().catch(() => ({})));
  if (!b.success || !z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 });
  const { data, error } = await a.db.from('appointments').update({ status: b.data.status }).eq('id', id).eq('clinic_id', a.clinicId).select('id, contact_id').maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Consulta não encontrada' }, { status: 404 });
  await a.db.from('activities').insert({ clinic_id: a.clinicId, contact_id: data.contact_id, type: 'sistema', body: `Consulta marcada como ${b.data.status} pela automação${b.data.note ? ': ' + b.data.note : ''}` });
  return NextResponse.json({ ok: true });
}
