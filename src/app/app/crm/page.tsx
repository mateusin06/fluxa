import Link from 'next/link';
import { getContext } from '@/lib/clinic';
import { PageHeader } from '@/components/bits';
import { Kanban, type KDeal } from './kanban';

export const metadata = { title: 'Funil' };

export default async function CrmPage() {
  const { supabase, clinic, writable } = await getContext();
  const [{ data: stages }, { data: deals }] = await Promise.all([
    supabase.from('stages').select('id, name, kind, color, position').eq('clinic_id', clinic.id).order('position'),
    supabase.from('deals').select('id, title, value, stage_id, position, contact_id, updated_at, contact:contacts(name, phone, insurance)')
      .eq('clinic_id', clinic.id).order('position').limit(2000),
  ]);
  const list: KDeal[] = (deals || []).map((d) => ({
    id: d.id, title: d.title, value: Number(d.value), stage_id: d.stage_id, position: d.position, contact_id: d.contact_id,
    updated_at: d.updated_at, contact: (d.contact as unknown as { name: string; phone: string | null }) || { name: '', phone: null },
  }));
  return (
    <>
      <PageHeader title="Funil de oportunidades" desc="Arraste os cards entre as etapas. Cada mudança fica registrada na linha do tempo do paciente.">
        <Link href="/app/contatos?novo=1" className="btn btn-pri">Novo lead</Link>
      </PageHeader>
      <Kanban stages={stages || []} deals={list} readOnly={!writable} />
    </>
  );
}
