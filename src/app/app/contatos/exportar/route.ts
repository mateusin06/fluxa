import { getContext } from '@/lib/clinic';

// Exporta os contatos da clínica (LGPD: portabilidade dos dados).
export async function GET() {
  const { supabase, clinic } = await getContext();
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from('contacts').select('name, phone, email, birth_date, source, tags, notes, created_at')
      .eq('clinic_id', clinic.id).order('created_at').range(from, from + 999);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  const head = ['nome', 'telefone', 'email', 'nascimento', 'origem', 'etiquetas', 'observacoes', 'cadastro'];
  const esc = (v: unknown) => `"${String(Array.isArray(v) ? v.join(', ') : v ?? '').replace(/"/g, '""')}"`;
  const csv = '﻿' + [head.join(';'), ...rows.map((r) => [r.name, r.phone, r.email, r.birth_date, r.source, r.tags, r.notes, r.created_at].map(esc).join(';'))].join('\n');
  return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="contatos-${clinic.id.slice(0, 8)}.csv"` } });
}
