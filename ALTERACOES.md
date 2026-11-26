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
