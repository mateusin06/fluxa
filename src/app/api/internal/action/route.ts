import { NextResponse } from 'next/server';
import { z } from 'zod';
import { internalAuthorized } from '@/lib/apikey';
import { runAdminAction } from '@/lib/admin-actions';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'x-fluxa-token, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
export function OPTIONS() { return new NextResponse(null, { headers: CORS }); }

export async function POST(req: Request) {
  if (!internalAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: CORS });
  const b = z.object({
    clinic_id: z.string().uuid(),
    action: z.enum(['ativar_manual', 'bloquear', 'desbloquear', 'estender_teste', 'automacao_instalando', 'automacao_ativa', 'automacao_cancelada']),
  }).safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Pedido inválido' }, { status: 400, headers: CORS });
  try {
    await runAdminAction(b.data.clinic_id, b.data.action, 'sistema_interno');
    return NextResponse.json({ ok: true }, { headers: CORS });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: CORS });
  }
}
