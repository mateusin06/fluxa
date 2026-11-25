import { SignInForm } from '../forms';
export const metadata = { title: 'Entrar' };
export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; erro?: string }> }) {
  const sp = await searchParams;
  return (<><h1 className="mb-1 font-display text-2xl font-bold">Entrar</h1><p className="mb-6 text-sm text-slate-600">Acesse o painel da sua clínica.</p>
    {sp.erro && <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{sp.erro}</p>}
    <SignInForm next={sp.next} /></>);
}
