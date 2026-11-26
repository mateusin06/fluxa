# Alterações: leads de convênio pela biblioteca n8n (B1)

## Ordem para atualizar
1. Suba este zip e faça o deploy **antes** de importar a biblioteca nova no n8n (o B1 novo lê a aba `Convenios`, que só existe a partir desta versão).
2. A migração `0008_convenio_nfse.sql` precisa estar rodada (é ela que criou os convênios). Sem migração nova.
3. Confira em *Clínica e equipe → Convênios* se a clínica atende convênio e quais.

## O que mudou
- **Modo planilha (`/api/v1/planilha`):** nova aba só leitura `Convenios` (`convenio`, `_row`) com os convênios que a clínica atende. Clínica que não atende (ou sem lista) devolve a aba vazia. Gravar nela responde erro explicando que os convênios são editados no sistema.
- O resto já existia na 0008 e agora é usado pelo B1: `Leads.convenio` grava o convênio no paciente (com `convenio_aceito` e a etiqueta "convênio não atendido"), `Agenda.pagamento`/`convenio` criam a consulta como convênio ou particular.
- Arquivos: `src/lib/planilha.ts`, `README.md`, `ALTERACOES.md`.

---

# Alterações: limite de imagens por IA

- Plano Sistema: 60 fundos de IA por mês (antes 20). Plano Sistema + automações: 120 (antes 40).
- Custo máximo de imagem por clínica: cerca de US$ 2,40 (60) e US$ 4,80 (120) por mês.
- Arquivo: `src/lib/plans.ts`. Sem migração, sem variável nova.

---

# Alterações: criativos já vêm com fundo de IA

## Ordem para atualizar
Sem migração, sem variável nova e sem `npm install`. Só subir e fazer o deploy.

## O que mudou
- **Fundo por padrão:** ao gerar criativos, a IA de texto escreve para cada variação uma "cena" de fotografia publicitária (ambiente, materiais, luz e cores, sem pessoas e sem texto). Ao abrir o estúdio, o fundo de cada variação é criado sozinho (até 3 ao mesmo tempo, com progresso na tela).
- **Um fundo por variação:** a mesma imagem serve ao feed, ao story e ao quadrado daquela variação (gerada em retrato e recortada). 3 variações = 3 imagens no limite do plano, não 6.
- **Sem repetição de gasto:** abrir o estúdio de novo não gera outro fundo. Se a geração falhar ou o limite do plano acabar, a arte segue com a cor da marca e o botão "Fundo com IA" continua disponível (agora já vem com a cena sugerida para editar).
- **Modelos de arte redesenhados para o fundo:** todos usam o fundo. "Foto em destaque", "Foto lateral" e "Autoridade" põem o fundo no lugar da foto quando não há foto, com transição em degradê para o texto; "Lista" e "Texto sobre o fundo" usam o fundo na arte inteira com degradê na cor da paleta para o texto ficar legível. Sem fundo, o espaço da foto vira um degradê da marca (antes era cinza). Botão com seta e sombra.
- **Prompt da imagem** mais produzido: estilo editorial de marca premium, luz trabalhada, desfoque elegante, cores da marca, espaço limpo para o texto.
- Arquivos: `src/app/api/ai/creatives/route.ts`, `src/app/api/ai/image/route.ts`, `src/app/app/criativos/[id]/studio.tsx`, `src/app/app/criativos/actions.ts`, `src/app/app/criativos/novo/brief-form.tsx`, `src/components/creative/templates.tsx`, `src/lib/ai-fallback.ts`, `src/lib/types.ts`, `README.md`, `ALTERACOES.md`.

---

# Alterações: tetos de tokens da IA

## Ordem para atualizar
Sem migração, sem variável nova e sem `npm install`. Só subir e fazer o deploy.

## O que mudou
- **Teto por chamada:** cada geração de texto pode gastar no máximo 6.000 tokens de saída (OpenAI `max_completion_tokens` e Gemini `maxOutputTokens`). A maior resposta do sistema, o plano de campanha, usa cerca de 3.500. Se um modelo cortar a resposta, o próximo da fila assume.
- **Teto mensal por clínica:** tokens de saída de texto no mês: 1,5 milhão no plano Sistema e 3 milhões no plano Sistema + automações (`src/lib/plans.ts`, campo `tokensTextoIA`). Ao passar, a IA de texto para com aviso e renova no dia 1º; a IA nem é chamada. Imagens continuam no limite de quantidade (20 e 40).
- **Assinatura:** a linha de uso mostra o percentual da franquia de texto da IA.
- Arquivos: `src/lib/plans.ts`, `src/lib/gemini.ts`, `src/app/app/assinatura/page.tsx`, `ALTERACOES.md`.

---

# Alterações: IA pela OpenAI (gpt-5.4-mini e gpt-image-2.6-sunburst)

## Ordem para atualizar
1. **Vercel → Environment Variables:** crie `OPENAI_API_KEY` com a chave da OpenAI (Production, Preview e Development).
2. Opcional (já são os padrões): `OPENAI_MODEL=gpt-5.4-mini`, `OPENAI_IMAGE_MODEL=gpt-image-2.6-sunburst`, `OPENAI_REASONING=low`, `OPENAI_IMAGE_QUALITY=medium`.
3. Mantenha `GEMINI_API_KEYS` se quiser o Gemini como reserva automática; apague se quiser só OpenAI.
4. Sem migração e sem `npm install`. Faça o deploy.

## O que mudou
- Todas as funções de IA (criativos, textos, campanha, follow-up e fundo de arte) usam primeiro a OpenAI.
- Texto: `gpt-5.4-mini`, raciocínio baixo, resposta em JSON estrito (o schema do Gemini é convertido sozinho).
- Fundo de arte: `gpt-image-2.6-sunburst`, qualidade média, 1024x1536 (feed e story) ou 1024x1024 (quadrado), recortado para o formato da arte.
- Se a OpenAI falhar (sem crédito, chave inválida, 429, 5xx, lenta, JSON quebrado, recusa do filtro), o Gemini assume com todos os modelos. Se nada responder, sai o modelo pronto sem IA.
- O filtro de segurança de um provedor não para mais o pedido: o outro é tentado; só avisa para reformular se todos recusarem.
- Política de privacidade cita a OpenAI.
- Arquivos: `src/lib/gemini.ts`, `src/lib/env.ts`, `src/app/privacidade/page.tsx`, `.env.example`, `README.md`, `ALTERACOES.md`.

---

# Alterações: celular, convênios, nota fiscal e modelo de imagem (migração 0008)

## Ordem para atualizar
1. **Supabase → SQL Editor:** rode `supabase/migrations/0008_convenio_nfse.sql` (depois do 0007). Pode rodar de novo sem erro.
2. **Clínica de demonstração (se usa):** rode de novo `supabase/demo/demo_clinica.sql` (corrigido: os ids agora são UUID válidos; antes, algumas fichas de paciente da demo davam erro).
3. **Vercel → Environment Variables:**
   - `GEMINI_IMAGE_MODEL` = `gemini-3.1-flash-image` (ou apague a variável). O `gemini-3.8-flash` não gera imagem, só texto.
   - `GEMINI_MODEL` = `gemini-3.8-flash` (ou apague a variável).
   - `NFSE_SECRET` = um texto longo e aleatório (cifra os certificados A1). Defina antes de as clínicas enviarem certificado.
4. `npm install` (entraram `nfse-js` e `node-forge`) e deploy.

## O que mudou
- **Celular:** tabelas viram cartões com o nome de cada campo; números grandes do painel cabem na tela; agenda abre no modo **Dia** no celular (com ‹ › para trocar o dia), além de Semana e Lista; formulários de nova consulta, cobrança, despesa e orçamento ficam recolhidos no celular; funil desliza coluna por coluna; menu com botão de fechar e cabeçalho fixo; campos com fonte 16 px (o iPhone não dá zoom).
- **Convênios:** Clínica e equipe → Convênios (atende? quais?). Paciente com convênio, carteirinha, plano e validade. Consulta particular ou convênio (com nº da guia), automático pelo convênio do paciente. Realizado gera cobrança do convênio para 30 dias, separada (filtro e total "De convênios" no Financeiro) e fora da régua de cobrança do WhatsApp. Leads com convênio pela planilha (Leads/Pacientes/Agenda, colunas novas depois de `_row`) e pela API `POST /api/v1/contacts` (`convenio`, `carteirinha`, `plano`); convênio não atendido vira etiqueta e aviso para oferecer particular.
- **Nota fiscal (NFS-e nacional):** menu Notas fiscais: configuração fiscal (CNPJ, CEP → código IBGE, regime, código de tributação, certificado A1), emissão com formulário completo (ou a partir de uma cobrança recebida: "Emitir NF" em Financeiro → Recebidas), PDF resumo, XML, cancelamento e "consultar de novo" quando a conexão cai. Ambiente de teste (produção restrita) por padrão.
- **IA de imagem:** padrão `gemini-3.1-flash-image`; textos em `gemini-3.8-flash`; se um modelo não existir para a chave, tenta o próximo.
- **Correção:** os formulários da nota fiscal não apagam o que foi digitado quando dá erro.

## Arquivos novos
- `src/app/app/agenda/day-mobile.tsx`
- `src/app/app/notas/[id]/page.tsx`
- `src/app/app/notas/[id]/pdf/route.ts`
- `src/app/app/notas/[id]/xml/route.ts`
- `src/app/app/notas/actions.ts`
- `src/app/app/notas/forms.tsx`
- `src/app/app/notas/page.tsx`
- `src/components/insurance-fields.tsx`
- `src/components/mobile-collapse.tsx`
- `src/components/table-labels.tsx`
- `src/lib/insurance-db.ts`
- `src/lib/insurance.ts`
- `src/lib/nfse.ts`
- `supabase/migrations/0008_convenio_nfse.sql`

## Arquivos alterados (substitua inteiro)
- `.env.example`
- `README.md`
- `next.config.ts`
- `package-lock.json`
- `package.json`
- `src/app/api/v1/appointments/route.ts`
- `src/app/api/v1/contacts/route.ts`
- `src/app/app/agenda/actions.ts`
- `src/app/app/agenda/new-appt.tsx`
- `src/app/app/agenda/page.tsx`
- `src/app/app/configuracoes/actions.ts`
- `src/app/app/configuracoes/forms.tsx`
- `src/app/app/configuracoes/page.tsx`
- `src/app/app/contatos/[id]/ficha/forms.tsx`
- `src/app/app/contatos/[id]/ficha/page.tsx`
- `src/app/app/contatos/[id]/forms.tsx`
- `src/app/app/contatos/[id]/page.tsx`
- `src/app/app/contatos/new-contact.tsx`
- `src/app/app/contatos/page.tsx`
- `src/app/app/crm-actions.ts`
- `src/app/app/crm/kanban.tsx`
- `src/app/app/crm/page.tsx`
- `src/app/app/financeiro/page.tsx`
- `src/app/app/orcamentos/editor.tsx`
- `src/app/app/orcamentos/page.tsx`
- `src/app/globals.css`
- `src/app/layout.tsx`
- `src/components/app/nav.tsx`
- `src/components/bits.tsx`
- `src/lib/env.ts`
- `src/lib/gemini.ts`
- `src/lib/planilha.ts`
- `src/lib/types.ts`
- `supabase/demo/demo_clinica.sql`
