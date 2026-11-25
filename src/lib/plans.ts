// Preços e limites da Fluxa. Mudou o preço? Mude só aqui.
export const PRICING = {
  sistemaMensal: 19700,          // R$ 197,00 por mês (centavos)
  automacoesInstalacao: 79700,   // R$ 797,00 uma vez
  automacoesMensal: 39700,       // R$ 397,00 por mês
  trialDias: 7,
  carenciaDias: 7,               // dias de atraso antes de bloquear a escrita
} as const;

export const LIMITS = {
  sistema: { textosIA: 300, imagensIA: 20, usuarios: 5 },
  sistema_automacoes: { textosIA: 600, imagensIA: 40, usuarios: 10 },
} as const;

export type Plan = keyof typeof LIMITS;

export const brl = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const AUTOMATION_FLOWS = [
  { id: 'C1', nome: 'Confirmação de consulta', desc: 'Confirma 24h antes pelo WhatsApp oficial, com botões de confirmar e remarcar.' },
  { id: 'C2', nome: 'Lista de espera inteligente', desc: 'Quando alguém desmarca, oferece o horário ao próximo da lista.' },
  { id: 'C3', nome: 'Reativação de pacientes', desc: 'Chama quem está há meses sem voltar, em lotes que protegem o número.' },
  { id: 'C4', nome: 'Retorno de procedimento', desc: 'Avisa no prazo certo de retorno de cada procedimento.' },
  { id: 'C5', nome: 'Pós-atendimento', desc: 'Mensagem de cuidado no dia seguinte ao atendimento.' },
  { id: 'C6', nome: 'Avaliação no Google', desc: 'Pergunta a nota; quem gostou recebe o link de avaliação, quem não gostou vira alerta.' },
  { id: 'C7', nome: 'Aniversário', desc: 'Parabéns com uma condição especial no mês do aniversário.' },
  { id: 'CB', nome: 'Cobrança amigável', desc: 'Lembretes de pagamento em aberto (D+1, D+5, D+10).' },
  { id: 'B1', nome: 'Leads de anúncio no CRM', desc: 'Quem chama pelo anúncio entra no CRM e recebe os horários livres da agenda para a avaliação.' },
] as const;
