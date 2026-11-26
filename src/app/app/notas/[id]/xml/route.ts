import { getContext } from '@/lib/clinic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Não encontrada', { status: 404 });
  const { supabase, clinic, isAdmin } = await getContext();
  if (!isAdmin) return new Response('Sem permissão', { status: 403 });
  const { data: n } = await supabase.from('nfse').select('xml_nfse, xml_dps, numero, serie, n_dps').eq('id', id).eq('clinic_id', clinic.id).maybeSingle();
  const tipo = new URL(req.url).searchParams.get('tipo') === 'dps' ? 'dps' : 'nfse';
  const xml = tipo === 'dps' ? n?.xml_dps : n?.xml_nfse;
  if (!xml) return new Response('XML não disponível', { status: 404 });
  const name = tipo === 'dps' ? `dps-${n!.serie}-${n!.n_dps}.xml` : `nfse-${n!.numero || n!.n_dps}.xml`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'private, no-store' } });
}
