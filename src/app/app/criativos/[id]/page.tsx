import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getContext } from '@/lib/clinic';
import { PageHeader } from '@/components/bits';
import { signMany } from '@/lib/signed';
import { Studio, type SCreative } from './studio';
import { RegenerateButton } from './regen';

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, clinic, writable } = await getContext();
  const { data: brief } = await supabase.from('creative_briefs').select('*').eq('id', id).eq('clinic_id', clinic.id).maybeSingle();
  if (!brief) notFound();
  const [{ data: creatives }, { data: pros }] = await Promise.all([
    supabase.from('creatives').select('*').eq('brief_id', id).neq('status', 'arquivado').order('created_at'),
    (brief.professional_ids as string[]).length ? supabase.from('professionals').select('id, name, registration, photo_path').in('id', brief.professional_ids) : Promise.resolve({ data: [] as { id: string; name: string; registration: string | null; photo_path: string | null }[] }),
  ]);
  const ordered = (brief.professional_ids as string[]).map((pid) => (pros || []).find((x) => x.id === pid)).filter((x) => x && x.photo_path) as { id: string; name: string; registration: string | null; photo_path: string }[];
  const urls = await signMany(supabase, [...ordered.map((x) => x.photo_path), ...(brief.photo_paths as string[]), clinic.logo_path, ...(creatives || []).map((c) => c.bg_path)]);
  const photos = [
    ...ordered.map((x) => ({ url: urls[x.photo_path], proName: x.name, proReg: x.registration || undefined })),
    ...(brief.photo_paths as string[]).map((ph) => ({ url: urls[ph] })),
  ].filter((x) => x.url);
  const footer = clinic.kind === 'odonto' && clinic.responsible_name
    ? `Resp. técnico: ${clinic.responsible_name}${clinic.responsible_reg ? ' — ' + clinic.responsible_reg : ''}`
    : [clinic.city, clinic.instagram].filter(Boolean).join(' · ');
  const list: SCreative[] = (creatives || []).map((c) => ({ id: c.id, format: c.format, template: c.template, content: c.content, ad_copy: c.ad_copy, compliance: c.compliance || [], status: c.status, bg: c.bg_path ? urls[c.bg_path] || null : null }));

  return (
    <>
      <PageHeader title={brief.title} desc="Edite os textos ao lado, troque o modelo e as cores, e baixe o PNG. O texto do anúncio vai no campo Texto principal da Meta.">
        <Link className="btn btn-sec" href="/app/criativos">Voltar</Link>
        {writable && <RegenerateButton briefId={id} />}
      </PageHeader>
      {sp.erro && <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{sp.erro}</p>}
      {clinic.kind === 'odonto' && !clinic.responsible_reg && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Cadastre o responsável técnico e o CRO em <Link className="underline" href="/app/configuracoes">Clínica e equipe</Link>: o Código de Ética do CFO pede essa informação na publicidade.</p>
      )}
      <Studio clinicId={clinic.id} clinicName={clinic.name} brand={clinic.brand} logo={clinic.logo_path ? urls[clinic.logo_path] || null : null}
        footer={footer} photos={photos} creatives={list} readOnly={!writable} />
    </>
  );
}
