import { NextResponse } from 'next/server';
import { z } from 'zod';
import { v1 } from '@/lib/v1';
import { normPhone } from '@/lib/utils';

// POST { phone | contact_id, body, type } — registra na linha do tempo (ex.: resposta do paciente)
export async function POST(req: Request) {
  const a = await v1(req); if ('error' in a) return a.error;
  const b = z.object({ contact_id: z.string().uuid().optional(), phone: z.string().optional(), body: z.string().min(1).max(4000), type: z.enum(['whatsapp', 'sistema', 'nota']).default('whatsapp') }).safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 });
  let cid = b.data.contact_id;
  if (!cid && b.data.phone) {
    const { data } = await a.db.from('contacts').select('id').eq('clinic_id', a.clinicId).eq('phone', normPhone(b.data.phone) || '-').maybeSingle();
    cid = data?.id;
  }
  if (!cid) return NextResponse.json({ error: 'Contato não encontrado' }, { status: 404 });
  const { error } = await a.db.from('activities').insert({ clinic_id: a.clinicId, contact_id: cid, type: b.data.type, body: b.data.body });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true }, { status: 201 });
}
