import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { internalAuthorized } from '@/lib/apikey';
import { normPhone } from '@/lib/utils';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'x-fluxa-token, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
export function OPTIONS() { return new NextResponse(null, { headers: CORS }); }

// Chamado pelo n8n interno da Fluxa quando uma clínica fecha pelo comercial.
// Cria (ou reaproveita) o usuário dono, a clínica e devolve um link de acesso para mandar no WhatsApp.
export async function POST(req: Request) {
  if (!internalAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: CORS });
  const b = z.object({
    nome_clinica: z.string().trim().min(2).max(120),
    tipo: z.enum(['odonto', 'estetica']).default('odonto'),
    responsavel: z.string().trim().min(2).max(120),
    email: z.string().trim().toLowerCase().email(),
    telefone: z.string().optional(),
    cidade: z.string().max(80).optional(),
    uf: z.string().max(2).optional(),
    plano: z.enum(['sistema', 'sistema_automacoes']).default('sistema'),
    dias_teste: z.number().int().min(0).max(60).default(7),
    automacoes: z.array(z.string().max(4)).optional(),
    conv_id: z.string().max(60).optional(),
  }).safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: b.error.issues[0].message }, { status: 400, headers: CORS });
  const d = b.data;
  const db = createAdminClient();
  const app = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');

  // 1) usuário: convite (novo) ou link mágico (já existe)
  let userId: string | undefined;
  let link: string | undefined;
  const inv = await db.auth.admin.generateLink({ type: 'invite', email: d.email, options: { data: { full_name: d.responsavel, phone: d.telefone }, redirectTo: `${app}/auth/confirm?next=/nova-senha` } });
  if (!inv.error) { userId = inv.data.user?.id; link = inv.data.properties?.action_link; }
  else {
    const ml = await db.auth.admin.generateLink({ type: 'magiclink', email: d.email, options: { redirectTo: `${app}/auth/confirm?next=/app` } });
    if (ml.error) return NextResponse.json({ error: ml.error.message }, { status: 500, headers: CORS });
    userId = ml.data.user?.id; link = ml.data.properties?.action_link;
  }
  if (!userId) return NextResponse.json({ error: 'Não foi possível criar o usuário' }, { status: 500, headers: CORS });

  // 2) clínica
  const { data: cid, error } = await db.rpc('provision_clinic', {
    p_owner: userId, p_name: d.nome_clinica, p_kind: d.tipo, p_phone: normPhone(d.telefone), p_city: d.cidade || null,
    p_state: (d.uf || '').toUpperCase() || null, p_plan: d.plano, p_trial_days: d.dias_teste, p_source: 'fluxa_comercial',
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: CORS });

  // 3) automações contratadas entram como "em instalação"
  if (d.plano === 'sistema_automacoes') {
    const { data: open } = await db.from('automation_requests').select('id').eq('clinic_id', cid).neq('status', 'cancelado').limit(1);
    if (!open?.length) {
      await db.from('automation_requests').insert({ clinic_id: cid, flows: d.automacoes || [], status: 'em_instalacao', contact_name: d.responsavel, contact_phone: normPhone(d.telefone), notes: d.conv_id ? `Comercial Fluxa · conversa ${d.conv_id}` : 'Comercial Fluxa' });
    }
  }
  await db.from('audit_log').insert({ clinic_id: cid, action: 'provision', detail: { email: d.email, plano: d.plano, conv_id: d.conv_id } });
  return NextResponse.json({ ok: true, clinic_id: cid, link, app_url: `${app}/app` }, { headers: CORS });
}
