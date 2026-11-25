import { SignUpForm } from '../forms';
export const metadata = { title: 'Criar conta' };
export default function Page() {
  return (<><h1 className="mb-1 font-display text-2xl font-bold">Teste a Fluxa por 7 dias</h1><p className="mb-6 text-sm text-slate-600">Sem cartão agora. Depois, R$ 197 por mês.</p><SignUpForm /></>);
}
