import Link from 'next/link';
import { getContext } from '@/lib/clinic';
import { PageHeader, Empty, Badge } from '@/components/bits';
import { fmtDate, fmtPhone } from '@/lib/utils';
import { NewContact } from './new-contact';
import { SOURCES } from '@/lib/sources';

export const metadata = { title: 'Pacientes e leads' };
const PER = 50;

export default async function ContactsPage({ searchParams }: { searchParams: Promise<{ q?: string; origem?: string; p?: string; novo?: string; convenio?: string }> }) {
  const { supabase, clinic, writable } = await getContext();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.p) || 1);
  let q = supabase.from('contacts').select('id, name, phone, email, source, tags, created_at, insurance', { count: 'exact' }).eq('clinic_id', clinic.id);
  if (sp.q) {
    const term = sp.q.replace(/[%,()]/g, ' ').trim();
    const digits = term.replace(/\D/g, '');
    q = digits.length >= 4 ? q.or(`name.ilike.%${term}%,phone.like.%${digits}%`) : q.ilike('name', `%${term}%`);
  }
  if (sp.origem) q = q.eq('source', sp.origem);
  if (sp.convenio === 'sim') q = q.not('insurance', 'is', null);
  else if (sp.convenio === 'nao') q = q.is('insurance', null);
  const { data, count } = await q.order('created_at', { ascending: false }).range((page - 1) * PER, page * PER - 1);
  const { data: procs } = await supabase.from('procedures').select('id, name').eq('clinic_id', clinic.id).eq('active', true).order('name');
  const label = Object.fromEntries(SOURCES);
  const pages = Math.ceil((count || 0) / PER);
  const qs = (p: number) => `?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.origem ? { origem: sp.origem } : {}), ...(sp.convenio ? { convenio: sp.convenio } : {}), p: String(p) })}`;

  return (
    <>
      <PageHeader title="Pacientes e leads" desc={`${count || 0} contato(s). Busque por nome ou telefone.`}>
        <a href="/app/contatos/exportar" className="btn btn-sec">Exportar CSV</a>
        {writable && <Link href={sp.novo ? '/app/contatos' : '/app/contatos?novo=1'} className="btn btn-pri">{sp.novo ? 'Fechar' : 'Novo contato'}</Link>}
      </PageHeader>
      {sp.novo && writable && <div className="mb-6"><NewContact procedures={procs || []} insurances={clinic.insurances || []} accepts={!!clinic.accepts_insurance} /></div>}
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <label htmlFor="q" className="sr-only">Buscar</label>
        <input id="q" name="q" defaultValue={sp.q} placeholder="Nome ou telefone" className="field max-w-xs" />
        <label htmlFor="origem" className="sr-only">Origem</label>
        <select id="origem" name="origem" defaultValue={sp.origem || ''} className="field max-w-48"><option value="">Todas as origens</option>{SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        {clinic.accepts_insurance && <><label htmlFor="conv" className="sr-only">Convênio</label><select id="conv" name="convenio" defaultValue={sp.convenio || ''} className="field max-w-48"><option value="">Convênio e particular</option><option value="sim">Só convênio</option><option value="nao">Só particular</option></select></>}
        <button className="btn btn-sec" type="submit">Filtrar</button>
      </form>
      {data?.length ? (
        <div className="card overflow-x-auto p-0">
          <table className="tbl">
            <thead><tr><th>Nome</th><th>WhatsApp</th><th>Origem</th>{clinic.accepts_insurance && <th>Convênio</th>}<th>Etiquetas</th><th>Cadastro</th></tr></thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id}>
                  <td><Link className="font-medium underline-offset-2 hover:underline" href={`/app/contatos/${c.id}`}>{c.name}</Link></td>
                  <td>{fmtPhone(c.phone)}</td>
                  <td>{label[c.source as keyof typeof label] || c.source}</td>
                  {clinic.accepts_insurance && <td>{c.insurance || <span className="text-slate-400">Particular</span>}</td>}
                  <td className="space-x-1">{(c.tags || []).map((t: string) => <Badge key={t}>{t}</Badge>)}</td>
                  <td>{fmtDate(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty title="Nenhum contato encontrado">Cadastre o primeiro ou conecte as automações para os leads entrarem sozinhos.</Empty>}
      {pages > 1 && (
        <nav aria-label="Páginas" className="mt-4 flex items-center gap-2 text-sm">
          {page > 1 && <Link className="btn btn-sec" href={qs(page - 1)}>Anterior</Link>}
          <span>Página {page} de {pages}</span>
          {page < pages && <Link className="btn btn-sec" href={qs(page + 1)}>Próxima</Link>}
        </nav>
      )}
    </>
  );
}
