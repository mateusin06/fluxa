import Link from 'next/link';
import { getContext } from '@/lib/clinic';
import { PageHeader, Empty, Badge } from '@/components/bits';
import { fmtDate } from '@/lib/utils';
import { signMany } from '@/lib/signed';
import { deleteBrief } from './actions';

export const metadata = { title: 'Criativos com IA' };

export default async function Page() {
  const { supabase, clinic, writable } = await getContext();
  const { data: briefs } = await supabase.from('creative_briefs').select('id, title, objective, created_at, creatives(id, image_path, status)')
    .eq('clinic_id', clinic.id).order('created_at', { ascending: false }).limit(60);
  const urls = await signMany(supabase, (briefs || []).flatMap((b) => (b.creatives as { image_path: string | null }[]).map((c) => c.image_path)));
  return (
    <>
      <PageHeader title="Criativos com IA" desc="Você envia as fotos dos profissionais e o direcionamento. A IA escreve os ganchos e os textos do anúncio e monta as artes na identidade da clínica.">
        {writable && <Link href="/app/criativos/novo" className="btn btn-lima">Novo criativo</Link>}
      </PageHeader>
      {briefs?.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {briefs.map((b) => {
            const cs = b.creatives as { id: string; image_path: string | null; status: string }[];
            const thumbs = cs.filter((c) => c.image_path && urls[c.image_path!]).slice(0, 3);
            return (
              <article key={b.id} className="card flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div><h2 className="font-semibold">{b.title}</h2><p className="text-xs text-slate-500">{fmtDate(b.created_at)} · {cs.length} arte(s)</p></div>
                  <Badge tone={cs.some((c) => c.status === 'aprovado') ? 'green' : 'slate'}>{cs.filter((c) => c.status === 'aprovado').length} aprovada(s)</Badge>
                </div>
                {thumbs.length > 0 && (
                  <div className="flex gap-2">{thumbs.map((t) => <img key={t.id} src={urls[t.image_path!]} alt="" className="h-28 w-auto rounded border border-slate-200" />)}</div>
                )}
                <div className="mt-auto flex gap-2">
                  <Link className="btn btn-pri" href={`/app/criativos/${b.id}`}>Abrir estúdio</Link>
                  {writable && <form action={deleteBrief}><input type="hidden" name="id" value={b.id} /><button className="btn btn-danger" type="submit">Excluir</button></form>}
                </div>
              </article>
            );
          })}
        </div>
      ) : <Empty title="Nenhum criativo ainda"><Link className="underline" href="/app/criativos/novo">Crie o primeiro em 2 minutos</Link>.</Empty>}
    </>
  );
}
