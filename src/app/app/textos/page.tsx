import { getContext } from '@/lib/clinic';
import { PageHeader, Empty, Badge } from '@/components/bits';
import { fmtDateTime } from '@/lib/utils';
import { CopyGen, CopyButton } from './gen';

export const metadata = { title: 'Textos com IA' };
const LABEL: Record<string, string> = { anuncio: 'Anúncio', legenda: 'Legenda', whatsapp: 'WhatsApp', google: 'Google', roteiro_video: 'Reels' };

export default async function Page() {
  const { supabase, clinic, writable } = await getContext();
  const { data } = await supabase.from('copies').select('id, kind, topic, content, created_at').eq('clinic_id', clinic.id).order('created_at', { ascending: false }).limit(30);
  return (
    <>
      <PageHeader title="Textos com IA" desc="Anúncios, legendas, mensagens de WhatsApp (no estilo de negociação do Chris Voss), posts do Google e roteiros de Reels." />
      {writable && <div className="mb-6"><CopyGen /></div>}
      {data?.length ? (
        <div className="space-y-4">
          {data.map((c) => {
            const ct = c.content as { itens: { titulo: string; texto: string; extra: string }[]; alertas: string[] };
            return (
              <section key={c.id} className="card">
                <header className="mb-3 flex flex-wrap items-center gap-2"><Badge tone="violet">{LABEL[c.kind] || c.kind}</Badge><h2 className="font-semibold">{c.topic}</h2><span className="text-xs text-slate-500">{fmtDateTime(c.created_at)}</span></header>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {ct.itens.map((i, k) => (
                    <article key={k} className="rounded-lg bg-slate-50 p-3 text-sm">
                      <div className="mb-1 flex items-center justify-between"><b>{i.titulo}</b><CopyButton text={i.texto + (i.extra ? `\n\n${i.extra}` : '')} /></div>
                      <p className="whitespace-pre-line">{i.texto}</p>
                      {i.extra && <p className="mt-2 text-xs text-slate-600">{i.extra}</p>}
                    </article>
                  ))}
                </div>
                {ct.alertas?.length > 0 && <ul className="mt-3 list-disc pl-5 text-xs text-amber-800">{ct.alertas.map((a, k) => <li key={k}>{a}</li>)}</ul>}
              </section>
            );
          })}
        </div>
      ) : <Empty title="Nenhum texto ainda" />}
    </>
  );
}
