import Link from 'next/link';
export const metadata = { title: 'Política de privacidade' };
export default function Page() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 text-sm leading-relaxed text-slate-800">
      <Link href="/" className="underline">Fluxa</Link>
      <h1 className="mb-4 mt-6 font-display text-3xl font-bold">Política de privacidade</h1>
      <p className="mb-3 rounded bg-amber-50 p-3 text-amber-900">Modelo inicial. Revise com um advogado antes de publicar.</p>
      <p>Tratamos dados de cadastro dos usuários (nome, e-mail, telefone) para prestar o serviço e cobrar a assinatura, e os dados que a clínica registra sobre seus pacientes, apenas por instrução da clínica (LGPD, art. 39).</p>
      <h2 className="mt-6 font-semibold">Onde ficam os dados</h2>
      <p>Banco de dados e arquivos no Supabase, com isolamento por clínica. Pagamentos processados pelo Pagar.me (grupo Stone); a Fluxa não armazena dados de cartão. Textos e pedidos de imagem enviados à IA são processados pela OpenAI e, quando ela não responde, pelo Google (Gemini).</p>
      <h2 className="mt-6 font-semibold">Direitos</h2>
      <p>A clínica pode exportar e excluir os dados dos pacientes no painel. Solicitações: [E-MAIL DO ENCARREGADO].</p>
    </main>
  );
}
