import { NextResponse } from 'next/server';
import { z } from 'zod';
import { v1 } from '@/lib/v1';
import { normPhone } from '@/lib/utils';

// GET ?phone=5519... | ?inactive_days=180 | ?birthday=MM-DD  (para as automações)
export async function GET(req: Request) {
  const a = await v1(req); if ('error' in a) return a.error;
  const u = new URL(req.url);
  let q = a.db.from('contacts').select('id, name, phone, email, birth_date, source, tags, last_visit_at, consent_whatsapp, created_at').eq('clinic_id', a.clinicId).limit(1000);
  const phone = normPhone(u.searchParams.get('phone'));
  if (u.searchParams.get('phone')) q = q.eq('phone', phone || '-');
  const inactive = Number(u.searchParams.get('inactive_days'));
  if (inactive > 0) q = q.lt('last_visit_at', new Date(Date.now() - inactive * 86400000).toISOString()).eq('consent_whatsapp', true);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const bd = u.searchParams.get('birthday');
  const rows = bd && /^\d{2}-\d{2}$/.test(bd) ? (data || []).filter((c) => c.birth_date?.slice(5) === bd) : data;
  return NextResponse.json({ data: rows });
}

// POST: lead novo (ex.: clique no anúncio do WhatsApp). Cria contato + oportunidade na 1ª etapa, ou registra atividade se já existe.
export async function POST(req: Request) {
  const a = await v1(req); if ('error' in a) return a.error;
  const b = z.object({
    name: z.string().trim().min(1).max(160), phone: z.string(), source: z.string().max(40).default('whatsapp'),
    source_detail: z.string().max(200).optional(), notes: z.string().max(2000).optional(), deal_title: z.string().max(120).optional(),
  }).safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: b.error.issues[0].message }, { status: 400 });
  const phone = normPhone(b.data.phone);
  if (!phone) return NextResponse.json({ error: 'Telefone inválido' }, { status: 400 });
  const { data: found } = await a.db.from('contacts').select('id').eq('clinic_id', a.clinicId).eq('phone', phone).maybeSingle();
  if (found) {
    await a.db.from('activities').insert({ clinic_id: a.clinicId, contact_id: found.id, type: 'sistema', body: `Novo contato pelo ${b.data.source}${b.data.source_detail ? ' — ' + b.data.source_detail : ''}${b.data.notes ? '\n' + b.data.notes : ''}` });
    return NextResponse.json({ id: found.id, created: false });
  }
  const { data: c, error } = await a.db.from('contacts').insert({ clinic_id: a.clinicId, name: b.data.name, phone, source: b.data.source, source_detail: b.data.source_detail, notes: b.data.notes }).select('id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data: st } = await a.db.from('stages').select('id').eq('clinic_id', a.clinicId).eq('kind', 'open').order('position').limit(1).single();
  if (st) await a.db.from('deals').insert({ clinic_id: a.clinicId, contact_id: c.id, stage_id: st.id, title: b.data.deal_title || 'Avaliação', value: 0 });
  return NextResponse.json({ id: c.id, created: true }, { status: 201 });
}
