import { NewPasswordForm } from '../forms';
export const metadata = { title: 'Nova senha' };
export default async function Page({ searchParams }: { searchParams: Promise<{ depois?: string }> }) {
  const { depois } = await searchParams;
  return (<><h1 className="mb-6 font-display text-2xl font-bold">Crie sua senha</h1><NewPasswordForm next={depois} /></>);
}
