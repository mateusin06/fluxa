import 'server-only';

/**
 * Textos prontos (sem IA) para quando nenhum modelo responder.
 * Seguem as mesmas regras de publicidade: sem promessa de resultado, sem preço, sem antes e depois.
 * Servem para a clínica nunca ficar sem resposta; a IA pode ser chamada de novo depois.
 */

export const OFFLINE_NOTE = 'Gerado com modelo pronto, sem IA (a IA estava indisponível agora). Revise o texto e, se quiser variações novas, gere de novo em alguns minutos.';

interface C { name: string; kind: 'odonto' | 'estetica'; city?: string | null; responsible_name?: string | null; responsible_reg?: string | null }
const area = (c: C) => (c.kind === 'odonto' ? 'sorriso' : 'pele');
const lugar = (c: C) => (c.city ? ` em ${c.city}` : '');
const rt = (c: C) => (c.responsible_name ? `Responsável técnico: ${c.responsible_name}${c.responsible_reg ? ` · ${c.responsible_reg}` : ''}` : '');

// ------------------------------------------------------------ criativos
export interface OffVar {
  template: string; paleta: 'marca' | 'escuro' | 'claro'; headline: string; destaque: string; subtitulo: string; bullets: string[];
  cta: string; selo: string; fotoIndex: number; texto_principal: string; titulo: string; descricao: string; cta_meta: string; compliance: string[];
  cena?: string;
}

/** Cenários de fundo prontos (o fundo continua sendo gerado por IA de imagem; só o texto é pronto). */
const CENAS = {
  odonto: [
    'consultório odontológico minimalista e moderno, cadeira branca, detalhes em madeira clara, plantas, luz natural suave pela janela',
    'recepção de clínica odontológica sofisticada, sofá claro, parede com textura, iluminação indireta quente, vaso com folhagem',
    'bancada branca com instrumentos odontológicos organizados e desfocados ao fundo, luz de estúdio suave, tons claros e frios',
    'sala de atendimento odontológico com grandes janelas, cidade desfocada ao fundo, ambiente limpo e luminoso',
    'composição abstrata com formas orgânicas em tons pastel e reflexos suaves de vidro, estilo editorial de saúde',
  ],
  estetica: [
    'bancada de mármore claro com frascos de skincare sem rótulo, folhas verdes, luz natural lateral suave, ambiente de spa sofisticado',
    'sala de procedimentos estéticos minimalista, maca clara, toalhas dobradas, luz quente indireta, plantas',
    'texturas de cremes e gotas de sérum sobre vidro, close macro, tons nude e dourados, luz de estúdio',
    'recepção de clínica de estética elegante, poltronas em bouclé, parede em tom areia, iluminação suave',
    'composição com pedras lisas, flores secas e água cristalina, tons neutros, estilo editorial de bem-estar',
  ],
} as const;

export function creativesOffline(o: { n: number; clinic: C; procedimento?: string | null; titulo: string; oferta?: string | null; profissional?: { name: string; registration?: string | null } | null; temFotoProf: boolean; fotos: number }): { variacoes: OffVar[] } {
  const c = o.clinic, proc = o.procedimento || (c.kind === 'odonto' ? 'avaliação odontológica' : 'avaliação estética');
  const procL = proc.toLowerCase();
  const prof = o.profissional;
  const assinatura = rt(c);
  const base = (v: Partial<OffVar>): OffVar => ({
    template: 'destaque', paleta: 'marca', headline: '', destaque: '', subtitulo: '', bullets: [], cta: 'Chame no WhatsApp', selo: '',
    fotoIndex: o.fotos ? 0 : -1, texto_principal: '', titulo: '', descricao: c.name.slice(0, 30), cta_meta: 'Enviar mensagem', compliance: [OFFLINE_NOTE], ...v,
  });
  const all: OffVar[] = [
    base({
      template: o.fotos ? 'destaque' : 'tipografico', headline: `Cuidar do seu ${area(c)} começa com uma boa avaliação`, destaque: 'avaliação',
      subtitulo: `${proc} na ${c.name}${lugar(c)}, com atendimento sem pressa e explicação de cada etapa.`,
      texto_principal: `Você merece entender cada passo antes de decidir.\nNa ${c.name}${lugar(c)}, a ${procL} começa com uma conversa e uma avaliação cuidadosa.\nTire suas dúvidas e escolha o melhor horário.\nChame a gente no WhatsApp 👇${assinatura ? `\n\n${assinatura}` : ''}`,
      titulo: `${proc}${lugar(c)}`.slice(0, 40),
    }),
    base({
      template: 'lista', paleta: 'claro', headline: `Por que fazer ${procL} com a gente`, destaque: procL.split(' ')[0],
      subtitulo: 'Atendimento próximo, do primeiro contato ao pós.', bullets: ['Avaliação antes de tudo', 'Plano explicado com calma', 'Horários que cabem na rotina', 'Acompanhamento depois'],
      fotoIndex: -1,
      texto_principal: `Antes de qualquer procedimento, a gente avalia, explica e só então planeja.\n${proc} com cuidado em cada detalhe.\nQuer saber se é indicado para você? Fale com a nossa equipe no WhatsApp.${assinatura ? `\n\n${assinatura}` : ''}`,
      titulo: 'Agende sua avaliação', cta_meta: 'Agendar agora',
    }),
    base({
      template: o.temFotoProf ? 'autoridade' : 'lateral', paleta: 'escuro',
      headline: prof ? `Quem vai cuidar de você: ${prof.name}`.slice(0, 60) : `Cuidado de quem entende de ${area(c)}`, destaque: prof ? prof.name.split(' ').slice(-1)[0] : area(c),
      subtitulo: prof ? `${prof.registration ? prof.registration + ' · ' : ''}${proc} com atenção a cada detalhe.` : `Equipe da ${c.name} pronta para te atender.`,
      fotoIndex: o.temFotoProf ? 0 : o.fotos ? 0 : -1,
      texto_principal: `${prof ? `Conheça ${prof.name}${prof.registration ? ` (${prof.registration})` : ''}.` : `Conheça a equipe da ${c.name}.`}\nCada caso é avaliado com calma e explicado de forma clara.\nMande uma mensagem e agende sua avaliação.${assinatura ? `\n\n${assinatura}` : ''}`,
      titulo: 'Conheça quem vai te atender',
    }),
    base({
      template: 'tipografico', paleta: 'marca', headline: 'Ficou com dúvida? A gente responde no WhatsApp', destaque: 'WhatsApp',
      subtitulo: `Sobre ${procL}, horários ou como funciona a avaliação.`, fotoIndex: -1,
      texto_principal: `Tem dúvida sobre ${procL}?\nNossa equipe responde pelo WhatsApp e já encontra um horário para você.\nÉ só tocar no botão e mandar um oi.${assinatura ? `\n\n${assinatura}` : ''}`,
      titulo: 'Tire suas dúvidas', cta: 'Mande um oi',
    }),
    base({
      template: 'destaque', paleta: 'claro', headline: (o.oferta ? o.oferta : `Agenda aberta para ${procL}`).slice(0, 60), destaque: 'agenda',
      subtitulo: `${c.name}${lugar(c)}. Vagas desta semana.`,
      texto_principal: `${o.oferta ? o.oferta + '\n' : ''}Separamos horários desta semana para ${procL}.\nGaranta o seu pelo WhatsApp.${assinatura ? `\n\n${assinatura}` : ''}`,
      titulo: 'Horários desta semana', compliance: [OFFLINE_NOTE, ...(o.oferta ? ['Se a condição envolve preço ou desconto, confira as regras do conselho antes de publicar.'] : [])],
    }),
  ];
  return { variacoes: all.slice(0, Math.max(1, Math.min(5, o.n))).map((v, i) => ({ ...v, cena: CENAS[c.kind][i % CENAS[c.kind].length] })) };
}

// ------------------------------------------------------------ textos
export function copiesOffline(kind: string, topic: string, qtd: number, c: C) {
  const t = topic.trim();
  const ass = rt(c);
  const pick: Record<string, { titulo: string; texto: string; extra: string }[]> = {
    anuncio: [
      { titulo: 'Direto', texto: `${t}\nNa ${c.name}${lugar(c)}, tudo começa com uma avaliação cuidadosa e explicação de cada etapa.\nChame no WhatsApp e escolha seu horário.${ass ? `\n\n${ass}` : ''}`, extra: `Título: ${t.slice(0, 38)} | CTA: Enviar mensagem` },
      { titulo: 'Dúvida', texto: `Ainda com dúvidas sobre ${t.toLowerCase()}?\nA nossa equipe explica com calma, sem compromisso.\nMande uma mensagem pelo WhatsApp.${ass ? `\n\n${ass}` : ''}`, extra: 'Título: Tire suas dúvidas | CTA: Saiba mais' },
      { titulo: 'Agenda', texto: `Separamos horários desta semana para ${t.toLowerCase()}.\n${c.name}${lugar(c)}.\nGaranta o seu pelo WhatsApp.${ass ? `\n\n${ass}` : ''}`, extra: 'Título: Horários desta semana | CTA: Agendar agora' },
    ],
    legenda: [
      { titulo: 'Educativo', texto: `${t}: você sabia que tudo começa com uma boa avaliação? Cada caso é único e merece um plano feito sob medida. Tem dúvida? Manda pra gente no direct ou no WhatsApp.`, extra: `#${c.kind === 'odonto' ? 'odontologia' : 'estetica'} #saude #${(c.city || 'clinica').toLowerCase().replace(/\s+/g, '')}` },
      { titulo: 'Bastidores', texto: `Hoje o assunto é ${t.toLowerCase()}. Aqui na ${c.name}, a gente explica cada etapa antes de começar, sem pressa. Quer saber se é para você? Chama no WhatsApp.`, extra: `#${c.kind === 'odonto' ? 'sorriso' : 'pele'} #cuidado` },
      { titulo: 'Convite', texto: `Agenda aberta para ${t.toLowerCase()}! Fale com a nossa equipe e escolha o melhor horário para você.`, extra: '#agendeja' },
    ],
    whatsapp: [
      { titulo: 'Rotulagem', texto: `Oi! Parece que você está pensando em ${t.toLowerCase()} e quer ter certeza antes de decidir, faz sentido. O que pesa mais para você hoje: horário, valor ou entender como funciona?`, extra: 'Técnica: rotulagem + pergunta calibrada' },
      { titulo: 'Pergunta do "não"', texto: `Oi! Seria ruim se eu te mandasse os horários livres desta semana para ${t.toLowerCase()}?`, extra: 'Técnica: pergunta orientada para o "não"' },
      { titulo: 'Retomada', texto: `Oi! Passando para saber se ficou alguma dúvida sobre ${t.toLowerCase()}. Como posso te ajudar a decidir?`, extra: 'Técnica: pergunta calibrada' },
    ],
    google: [
      { titulo: 'Novidade', texto: `${t} na ${c.name}${lugar(c)}. Atendimento com avaliação e explicação de cada etapa. Agende pelo WhatsApp.`, extra: 'Botão: Ligar / Saiba mais' },
      { titulo: 'Dica', texto: `Dica da ${c.name}: ${t.toLowerCase()} começa com uma avaliação. Assim o tratamento é planejado para o seu caso.`, extra: '' },
      { titulo: 'Agenda', texto: `Horários disponíveis esta semana para ${t.toLowerCase()}. Fale com a gente.`, extra: 'Botão: Agendar' },
    ],
    roteiro_video: [
      { titulo: 'Pergunta e resposta', texto: `Cena 1 (0-3s): pergunta na tela "${t}: é para mim?"\nCena 2 (3-15s): profissional explica em 2 frases como é a avaliação.\nCena 3 (15-25s): ambiente da clínica.\nCena 4 (25-30s): "Chame no WhatsApp" na tela.`, extra: 'Texto na tela curto; legenda automática ligada' },
      { titulo: 'Passo a passo', texto: `Cena 1: "Como funciona ${t.toLowerCase()}?"\nCena 2: etapa 1, a avaliação.\nCena 3: etapa 2, o plano explicado.\nCena 4: convite para agendar.`, extra: '' },
      { titulo: 'Bastidores', texto: `Cena 1: chegada na recepção.\nCena 2: preparo do consultório.\nCena 3: profissional fala "${t}".\nCena 4: CTA para o WhatsApp.`, extra: '' },
    ],
  };
  const list = pick[kind] || pick.anuncio;
  const itens = Array.from({ length: Math.max(1, Math.min(6, qtd)) }, (_, i) => list[i % list.length]);
  return { itens, alertas: [OFFLINE_NOTE] };
}

// ------------------------------------------------------------ campanha
export function campaignOffline(o: { nome: string; objetivo: string; orcamento: number; raio?: string | null; clinic: C }) {
  const c = o.clinic, d = o.orcamento;
  return {
    resumo: `Campanha de mensagens no WhatsApp para "${o.nome}", com R$ ${d.toFixed(0)} por dia. Estrutura simples para aprender rápido o que funciona.`,
    estrutura: '1 campanha, 1 conjunto de anúncios aberto, 3 anúncios com ângulos diferentes',
    objetivo_meta: 'Engajamento > Conversas por mensagem, com destino WhatsApp',
    publico: { localizacao: o.raio || `${c.city || 'cidade da clínica'} e raio de 8 a 10 km`, idade: '25 a 55 anos', genero: 'Todos', interesses: 'Público aberto (deixe a Meta encontrar)', observacao: 'Exclua quem já é paciente, se tiver a lista' },
    orcamento: `R$ ${d.toFixed(0)} por dia no conjunto. Não mexa nos primeiros 4 dias; depois, ajuste no máximo 20% por vez.`,
    anuncios: [
      { nome: 'Anúncio 1', angulo: 'Avaliação', gancho: 'Tudo começa com uma boa avaliação', texto_principal: `Na ${c.name}, cada caso é avaliado com calma antes de qualquer procedimento. Chame no WhatsApp e escolha seu horário.` },
      { nome: 'Anúncio 2', angulo: 'Dúvida', gancho: 'Ficou com dúvida? A gente responde', texto_principal: 'Mande sua dúvida pelo WhatsApp: a equipe explica e já encontra um horário para você.' },
      { nome: 'Anúncio 3', angulo: 'Agenda', gancho: 'Horários desta semana', texto_principal: `Separamos horários desta semana${c.city ? ` em ${c.city}` : ''}. Garanta o seu pelo WhatsApp.` },
    ],
    mensagem_whatsapp: 'Oi! Vi o anúncio e quero saber os horários disponíveis.',
    cronograma: ['Dia 1: publicar os 3 anúncios.', 'Dia 4: pausar o anúncio com custo por conversa muito acima dos outros.', 'Dia 7: aumentar 20% o orçamento se o custo por conversa estiver bom.', 'Dia 14: trocar o pior anúncio por uma variação nova.'],
    metricas: ['Custo por conversa iniciada: compare entre os anúncios e mantenha os mais baratos.', 'Conversas que viram agendamento: meta de 1 a cada 3 ou 4.', 'Faltas nas avaliações: se passar de 20%, reforce a confirmação.'],
    alertas: [OFFLINE_NOTE, 'Não use promessa de resultado nem antes e depois nos anúncios.'],
  };
}

// ------------------------------------------------------------ follow-up
export function followupOffline(nome: string, goal: string) {
  const n = nome || 'tudo bem';
  return {
    mensagens: [
      { abordagem: 'Pergunta calibrada (modelo pronto)', texto: `Oi, ${n}! Passando para saber como posso te ajudar com ${goal.toLowerCase()}. O que seria mais importante para você agora?` },
      { abordagem: 'Pergunta do "não" (modelo pronto)', texto: `Oi, ${n}! Seria ruim se eu te mandasse os horários livres desta semana?` },
    ],
  };
}
