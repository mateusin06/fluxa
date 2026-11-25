import { redirect } from 'next/navigation';
import { getContext } from '@/lib/clinic';
import { PageHeader } from '@/components/bits';
import { signMany } from '@/lib/signed';
import { BriefForm } from './brief-form';

export const metadata = { title: 'Novo criativo' };

export default async function Page() {
  const { supabase, clinic, writable } = await getContext();
  if (!writable) redirect('/app/assinatura');
  const [{ data: pros }, { data: procs }] = await Promise.all([
    supabase.from('professionals').select('id, name, specialty, photo_path').eq('clinic_id', clinic.id).eq('active', true).order('name'),
    supabase.from('procedures').select('id, name').eq('clinic_id', clinic.id).eq('active', true).order('name'),
  ]);
  const urls = await signMany(supabase, (pros || []).map((p) => p.photo_path));
  return (
    <>
      <PageHeader title="Novo criativo" desc="Quanto mais direcionamento, melhor. A IA respeita as regras de publicidade do seu conselho e da Meta, mas a revisão final é sempre da clínica." />
      <BriefForm clinicId={clinic.id} procs={procs || []} pros={(pros || []).map((p) => ({ id: p.id, name: p.name, specialty: p.specialty, photo: p.photo_path ? urls[p.photo_path] || null : null }))} />
    </>
  );
}
