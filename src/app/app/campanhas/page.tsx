import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getContext } from '@/lib/clinic';
import { PageHeader, Empty, Badge } from '@/components/bits';
import { fmtDate, money } from '@/lib/utils';
import { CampaignGen } from './gen';

export const metadata = { title: 'Campanhas' };
interface Plan {
  resumo: string; estrutura: string; objetivo_meta: string; publico: Record<string, string>; orcamento: string;
  anuncios: { nome: string; angulo: string; gancho: string; texto_principal: string }[]; mensagem_whatsapp: string;
  cronograma: string[]; metricas: string[]; alertas: string[];
}

async function setStatus(fd: FormData) {
  'use server';
  const { supabase, clinic } = await getContext();
  await supabase.from('campaigns').update({ status: z.enum(['planejada', 'ativa', 'pausada', 'encerrada']).parse(fd.get('status')) })
    .eq('id', z.string().uuid().parse(fd.get('id'))).eq('clinic_id', clinic.id);
  revalidatePath('/app/campanhas');
}

export default async function Page() {
  const { supabase, clinic, writable } = await getContext();
  const { data } = await supabase.from('campaigns').select('*').eq('clinic_id', clinic.id).order('created_at', { ascending: false }).limit(20);
  return (
    <>
      <PageHeader title="Campanhas" desc="A IA monta o plano no Gerenciador de Anúncios da Meta: estrutura, público, orçamento, anúncios, mensagem do WhatsApp e o que olhar a cada dia." />
      {writable && <div className="mb-6"><CampaignGen /></div>}
      {data?.length ? data.map((c) => {
        const p = c.plan as Plan;
        return (
          <details key={c.id} className="card mb-4" open={c === data[0]}>
            <summary className="flex cursor-pointer flex-wrap items-center gap-2"><b>{c.name}</b><Badge tone={c.status === 'ativa' ? 'green' : 'slate'}>{c.status}</Badge><span className="text-xs text-slate-500">{fmtDate(c.created_at)} · {money(c.daily_budget)}/dia</span></summary>
            <div className="mt-4 grid gap-4 text-sm lg:grid-cols-2">
              <div className="space-y-2">
                <p>{p.resumo}</p>
                <p><b>Estrutura:</b> {p.estrutura}</p>
                <p><b>No Gerenciador:</b> {p.objetivo_meta}</p>
                <p><b>Orçamento:</b> {p.orcamento}</p>
                <p><b>Público:</b> {Object.entries(p.publico || {}).map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>
                <p><b>Mensagem do WhatsApp:</b> “{p.mensagem_whatsapp}”</p>
                <div><b>Cronograma</b><ul className="list-disc pl-5">{p.cronograma.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                <div><b>Métricas e decisões</b><ul className="list-disc pl-5">{p.metricas.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                {p.alertas?.length > 0 && <ul className="list-disc pl-5 text-amber-800">{p.alertas.map((x, i) => <li key={i}>{x}</li>)}</ul>}
              </div>
              <div className="space-y-3">
                {p.anuncios.map((a, i) => (
                  <article key={i} className="rounded-lg bg-slate-50 p-3"><p className="text-xs font-semibold uppercase text-slate-500">{a.nome} · {a.angulo}</p><p className="font-semibold">{a.gancho}</p><p className="mt-1 whitespace-pre-line">{a.texto_principal}</p></article>
                ))}
              </div>
            </div>
            {writable && (
              <form action={setStatus} className="mt-4 flex gap-2"><input type="hidden" name="id" value={c.id} />
                <label htmlFor={`st-${c.id}`} className="sr-only">Status</label>
                <select id={`st-${c.id}`} name="status" defaultValue={c.status} className="field max-w-48"><option value="planejada">Planejada</option><option value="ativa">Ativa</option><option value="pausada">Pausada</option><option value="encerrada">Encerrada</option></select>
                <button className="btn btn-sec" type="submit">Atualizar</button>
              </form>
            )}
          </details>
        );
      }) : <Empty title="Nenhuma campanha planejada" />}
    </>
  );
}
