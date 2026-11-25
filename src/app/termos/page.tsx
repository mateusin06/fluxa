import Link from 'next/link';
export const metadata = { title: 'Termos de uso' };
export default function Page() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 text-sm leading-relaxed text-slate-800">
      <Link href="/" className="underline">Fluxa</Link>
      <h1 className="mb-4 mt-6 font-display text-3xl font-bold">Termos de uso</h1>
      <p className="mb-3 rounded bg-amber-50 p-3 text-amber-900">Modelo inicial. Revise com um advogado e preencha os campos entre colchetes antes de publicar.</p>
      <p>A Fluxa ([RAZÃO SOCIAL], CNPJ [CNPJ]) oferece um sistema on-line para clínicas com CRM, agenda, criação de conteúdo com inteligência artificial e automações de WhatsApp.</p>
      <h2 className="mt-6 font-semibold">Assinatura</h2>
      <p>O sistema custa R$ 197 por mês, cobrado de forma recorrente. Há 7 dias de teste. Sem pagamento, a conta fica em modo somente leitura e os dados continuam disponíveis para exportação. O cancelamento pode ser feito a qualquer momento no painel e vale ao fim do período pago.</p>
      <h2 className="mt-6 font-semibold">Automações</h2>
      <p>A instalação das automações custa R$ 797 (uma vez) e a manutenção R$ 397 por mês. As tarifas de mensagens da API oficial do WhatsApp são cobradas pela Meta diretamente na conta da clínica.</p>
      <h2 className="mt-6 font-semibold">Conteúdo gerado por IA</h2>
      <p>Os textos e artes são sugestões. A clínica é responsável por revisar o conteúdo e cumprir as normas do seu conselho profissional, do Código de Defesa do Consumidor e das políticas da Meta antes de publicar.</p>
      <h2 className="mt-6 font-semibold">Dados</h2>
      <p>A clínica é a controladora dos dados dos seus pacientes; a Fluxa atua como operadora, conforme a <Link className="underline" href="/privacidade">Política de Privacidade</Link>.</p>
      <h2 className="mt-6 font-semibold">Foro</h2>
      <p>Fica eleito o foro da comarca de [CIDADE/UF].</p>
    </main>
  );
}
