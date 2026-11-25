import 'server-only';
import type { Clinic } from '@/lib/types';

export const OBJECTIVES = {
  agendar: 'Gerar conversas no WhatsApp para agendar avaliação',
  procedimento: 'Divulgar um procedimento específico',
  reativar: 'Trazer de volta pacientes que sumiram',
  autoridade: 'Mostrar a autoridade e o cuidado do profissional',
  institucional: 'Apresentar a clínica e a estrutura',
  indicacao: 'Estimular indicações de pacientes',
} as const;
export type Objective = keyof typeof OBJECTIVES;

export function clinicBrief(c: Clinic) {
  return [
    `Clínica: ${c.name} (${c.kind === 'odonto' ? 'odontológica' : 'de estética'})`,
    c.city ? `Cidade: ${c.city}${c.state ? '/' + c.state : ''}` : '',
    c.responsible_name ? `Responsável técnico: ${c.responsible_name}${c.responsible_reg ? ' — ' + c.responsible_reg : ''}` : '',
    c.instagram ? `Instagram: ${c.instagram}` : '',
  ].filter(Boolean).join('\n');
}

export const VOSS = `Técnicas de negociação do livro "Negocie como se sua vida dependesse disso" (Chris Voss), use quando fizer sentido:
- Rotulagem: "Parece que...", "Deve ser...".
- Pergunta orientada para o "não": "Seria ruim se...?".
- Perguntas calibradas: "Como...?" e "O que...?" (nunca "por quê").
- Espelhamento e resumo ("é isso mesmo?").
Mensagens curtas, humanas, sem pressão nem manipulação.`;
