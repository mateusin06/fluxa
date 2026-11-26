# Fluxa — SaaS para clínicas odontológicas e de estética

CRM, agenda, criativos e textos com IA (Gemini), planejador de campanhas, contratação de automações de WhatsApp e cobrança recorrente (Pagar.me / Stone). Multi-clínica, com isolamento por clínica no banco (RLS).

**Stack:** Next.js 15 (App Router) na Vercel · Supabase (Auth, Postgres, Storage) · Gemini (texto e imagem) · Pagar.me API v5 · n8n (integração com o comercial da Fluxa).

---

## 1. Como funciona

| Módulo | Onde | O que faz |
|---|---|---|
| Conta e clínicas | `/cadastro`, `/onboarding`, `/convite/...` | Cadastro com e-mail e senha, 7 dias de teste, várias clínicas por usuário, convite de equipe (dono, administrador, equipe). |
| Painel | `/app` | Faturado no mês (cobranças pagas), a receber e vencido, resultado do mês (dono/admin), orçamentos aguardando resposta, leads do mês, valor em negociação, fechado no mês, taxa de faltas, aviso de lembretes de amanhã não enviados, agenda do dia, tarefas. |
| CRM | `/app/crm`, `/app/contatos` | Funil arrastável, contatos com busca, linha do tempo, tarefas, exportação CSV, exclusão (LGPD, apaga também ficha e fotos), sugestão de mensagem com IA no estilo Chris Voss. CPF do paciente (sai no recibo). |
| Ficha clínica | `/app/contatos/{id}/ficha` | Anamnese (condições de saúde marcáveis, alergias, medicamentos...), alerta de alergias no topo, evolução por consulta (não pode ser editada nem apagada) e fotos privadas. Só o dono e quem tiver o acesso ligado em Clínica e equipe → Equipe veem (regra no banco e no Storage). |
| Orçamentos | `/app/orcamentos` | Plano de tratamento com vários procedimentos (dente/região, sessões, valor), desconto, validade, PDF, envio pelo WhatsApp. Aprovar: forma de pagamento e parcelas → cobranças no Financeiro (cartão = uma cobrança paga com as parcelas da maquininha; Pix/boleto/dinheiro = N cobranças mensais, entrada opcional) e oportunidade ganha no funil. As sessões ficam na ficha do paciente com o botão **Agendar sessão** (não cobram de novo ao marcar realizado). Recusar guarda o motivo e leva a oportunidade para perdido. |
| Financeiro | `/app/financeiro` | A receber, Recebidas (por mês e por forma de pagamento, recibo em PDF), Despesas (categorias, repetir por N meses, só dono/admin), Resultado do mês (entradas − despesas pagas, por forma e por categoria) e Comissões (por profissional, sobre o recebido no mês, com lançamento como despesa). |
| Agenda | `/app/agenda`, `/app/configuracoes#horarios` | Grade semanal com horários (ou lista), filtro por profissional, lembretes de amanhã com um toque (abre o WhatsApp com a mensagem pronta). **Agenda por profissional:** cada um pode ter horário próprio e os procedimentos que faz; um profissional nunca tem duas consultas ao mesmo tempo; sem profissional escolhido, o sistema pega o primeiro livre; a capacidade da clínica (cadeiras/salas) continua valendo. Forma de pagamento (Pix, cartão com parcelas, dinheiro...) ao dar baixa. Cancelar uma consulta futura avisa a lista de espera (C2a) se o webhook estiver em Clínica e equipe. Horário de atendimento por dia da semana (vários intervalos por dia, para o almoço). O que não está ocupado vira horário livre na semana e é oferecido pelo WhatsApp. Procedimento escolhido da lista ou escrito à mão (com preço próprio); a duração vem do cadastro e pode ser mudada. Consulta ocupa a duração inteira e o próximo livre começa no fim dela. Capacidade de atendimentos simultâneos, aviso de horário ocupado (com opção de encaixe), status confirmado / realizado / faltou. Busca de paciente com lupa (nome ou telefone). Consulta com valor tem os botões **Realizado · Já pago** e **Realizado · Vai pagar no balcão**; a cobrança entra sozinha no Financeiro (paga ou em aberto) e o botão **Recebido** dá baixa. |
| Criativos com IA | `/app/criativos` | Briefing + fotos dos profissionais → Gemini escreve ganchos e texto do anúncio → 5 modelos de arte na identidade da clínica → editor → PNG. Fundo por IA opcional (sem pessoas). |
| Textos com IA | `/app/textos` | Anúncio, legenda, WhatsApp, Google, roteiro de Reels. |
| Campanhas | `/app/campanhas` | Plano de campanha na Meta (estrutura, público, orçamento, anúncios, cronograma, métricas). |
| Automações | `/app/automacoes` | Contratação (R$ 797 + R$ 397/mês) e status; avisa o seu n8n. |
| Assinatura | `/app/assinatura` | R$ 197/mês por cartão (recorrente) ou boleto, via Pagar.me. |
| Admin | `/admin` | Só para você: MRR, todas as clínicas, ativar/bloquear/estender teste, status das automações. |
| APIs | `/api/internal/*`, `/api/v1/*` | Comercial da Fluxa (n8n) e automações das clínicas (n8n). |

Regras de cobrança: teste de 7 dias → sem assinatura, a clínica vira **somente leitura** (vê e exporta os dados, não grava). Pagamento falhou → 7 dias de carência → bloqueio. Cancelou → acesso até o fim do período pago. Tudo isso é aplicado no banco (RLS), não só na tela.

Preços e limites ficam em `src/lib/plans.ts`.

---

## 2. Colocar no ar (uma vez)

### 2.1 Supabase
1. Crie o projeto em supabase.com (região São Paulo).
2. **SQL Editor** → rode, nesta ordem: `supabase/migrations/0001_schema.sql`, `0002_security.sql`, `0003_storage.sql`, `0004_automacoes.sql`, `0005_horarios.sql`, `0006_cobranca_consulta.sql`, `0007_clinica_completa.sql` (cada arquivo num Run separado: o 0004 cria valores novos de status que o Postgres só aceita usar depois que o Run termina).
3. **Authentication → URL Configuration**: Site URL = `https://SEU-DOMINIO`; Redirect URLs: `https://SEU-DOMINIO/auth/confirm**`.
4. **Authentication → Providers → Email**: deixe "Confirm email" ligado.
5. **Authentication → Email**: aumente o prazo dos links (OTP expiry) para 86400 segundos. Os links de acesso criados pelo comercial (WhatsApp) usam esse prazo.
6. **Authentication → SMTP**: configure um SMTP próprio (Resend, Brevo, SES). O SMTP padrão do Supabase tem limite baixo de envios por hora e não serve para produção.
7. Depois de criar a sua conta no app, rode no SQL Editor para virar admin:
   `update public.profiles set is_platform_admin = true where id = (select id from auth.users where email = 'SEU-EMAIL');`

### 2.2 Vercel
1. Suba esta pasta para um repositório GitHub e importe na Vercel.
2. Cadastre as variáveis do `.env.example` (todas).
3. O `vercel.json` já agenda o cron diário de cobrança. Gere um `CRON_SECRET` forte: a Vercel envia esse valor no cabeçalho.
4. Aponte o domínio (ex.: `app.fluxa.com.br`) e preencha `NEXT_PUBLIC_APP_URL`.

### 2.3 Pagar.me (grupo Stone)
1. Na sua conta Stone/Pagar.me, ative o Pagar.me (pagamentos on-line) e pegue as chaves `sk_` e `pk_` (primeiro as de teste).
2. Em **Configurações → Webhooks**, crie um webhook para `https://SEU-DOMINIO/api/webhooks/pagarme` com autenticação básica (usuário e senha = `PAGARME_WEBHOOK_USER` / `PAGARME_WEBHOOK_PASSWORD`). Eventos: `invoice.paid`, `invoice.payment_failed`, `invoice.created`, `charge.paid`, `charge.payment_failed`, `subscription.canceled`.
3. No painel do Pagar.me, libere o domínio do app para tokenização de cartão (a chave pública roda no navegador).
4. Teste no modo sandbox: assine com cartão de teste, confira que a clínica vira **Ativa** sozinha.

### 2.4 Gemini
Crie as chaves no Google AI Studio e coloque em `GEMINI_API_KEYS` separadas por vírgula. O sistema reveza entre elas e pula a que bater no limite. O plano gratuito tem limites por minuto e por dia; para muitas clínicas, ative a cobrança em pelo menos uma chave (o modelo Flash é barato). Modelos em `GEMINI_MODEL` (padrão `gemini-3.8-flash`, textos) e `GEMINI_IMAGE_MODEL` (padrão `gemini-3.1-flash-image`, fundos das artes; o `gemini-3.8-flash` só devolve texto). Se o modelo configurado não existir para a chave, o sistema tenta o próximo da lista (texto: `gemini-3.8-flash`; imagem: `gemini-3.1-flash-image`, `gemini-nano-banana-2.1`, `gemini-3-pro-image`).

### 2.4b Nota fiscal (NFS-e nacional)
Cada clínica configura em **Notas fiscais → Configuração fiscal**: CNPJ, município (código IBGE pelo CEP), regime tributário, código de tributação nacional e o **certificado A1 (.pfx) com a senha**. A nota é montada (DPS, leiaute 1.01), assinada e enviada direto à Sefin Nacional (gov.br), sem intermediário pago. O certificado é guardado cifrado (AES-256-GCM) com a chave `NFSE_SECRET` (opcional; sem ela, deriva da `SUPABASE_SERVICE_ROLE_KEY` — se definir depois, os certificados salvos precisam ser enviados de novo). Comece no ambiente **Produção restrita** (teste oficial, sem valor fiscal). O município da clínica precisa emitir pelo Emissor Nacional.

### 2.5 n8n interno da Fluxa
No `Config` do fluxo interno: `saas_url` = `https://SEU-DOMINIO`, `saas_token` = o mesmo `INTERNAL_API_TOKEN`. O webhook `A8 · Webhook SaaS` (path `fluxa-saas`) vai em `FLUXA_N8N_WEBHOOK_URL`. Detalhes no guia interno (seções 1.3 e 2.8).

No sistema interno (HTML), em Configurações → Sistema Fluxa, preencha o mesmo endereço e token: a aba **Sistema Fluxa** passa a mostrar MRR, clínicas, testes e atrasos, e permite criar contas e ativar, bloquear ou estender testes.

---

## 3. APIs

### 3.1 Comercial da Fluxa (cabeçalho `x-fluxa-token: INTERNAL_API_TOKEN`)
- `POST /api/internal/provision` → cria o dono e a clínica e devolve `link` de acesso. Corpo: `nome_clinica, tipo (odonto|estetica), responsavel, email, telefone, cidade, uf, plano (sistema|sistema_automacoes), dias_teste, automacoes[], conv_id`. Repetir a chamada não duplica a clínica.
- `GET /api/internal/clinics` → lista com status, plano, assinatura, automação e MRR (usado pelo sistema interno).
- `POST /api/internal/action` → `{ clinic_id, action }` com `ativar_manual | bloquear | desbloquear | estender_teste | automacao_instalando | automacao_ativa | automacao_cancelada`.

### 3.2 Automações da clínica (cabeçalho `Authorization: Bearer flx_...`, chave criada em Clínica e equipe)
- `GET /api/v1/appointments?from=ISO&to=ISO&status=agendado,confirmado`
- `PATCH /api/v1/appointments/{id}` `{ status, note }` → `cancelado` em consulta futura avisa o webhook da lista de espera da clínica (responde `espera: enviado | sem_webhook | sem_fila | passado | erro`). Use `?avisar_espera=nao` quando o fluxo que cancelou já chama o C2a.
- `GET /api/v1/contacts?phone=` · `?inactive_days=180` · `?birthday=MM-DD`
- `POST /api/v1/contacts` `{ name, phone, source, source_detail, notes, deal_title, convenio, carteirinha, plano }` → lead entra no funil. Com `convenio`, responde `convenio: aceito | nao_atendido | null`: aceito = a clínica atende (as consultas saem pelo convênio); nao_atendido = etiqueta "convênio não atendido" e aviso na linha do tempo para oferecer particular.
- `POST /api/v1/activities` `{ phone | contact_id, body, type }`

- `GET /api/v1/horarios-livres?procedimento=Limpeza&profissional=Dra. Ana&dias=7&limite=50` → próximos horários livres, calculados do horário de cada profissional (ou da clínica) menos o que já está ocupado, só com quem faz o procedimento. Cada horário vem com `profissional`. Sem `procedimento`, usa o procedimento (ou a duração fixa) configurado para o WhatsApp.

### 3.3 Modo planilha (biblioteca de automações)
`/api/v1/planilha/values:batchGet`, `/values:batchUpdate` e `/values/{Aba}!A:Z:append`, com o cabeçalho `x-api-key: flx_...`. É a mesma interface do Google Sheets: os fluxos da biblioteca (B1, B3, C1 a C7) trocam só o endereço quando o `Config` tem `usa_sistema = SIM`.

| Aba | Vem de | Gravações |
|---|---|---|
| Agenda | consultas (`appointments`), 120 dias para trás e para frente; horário livre = status `livre`. Com horário de atendimento cadastrado, entram também os horários livres gerados (id `livre-AAAAMMDDHHmm`, linha a partir de 900000000), até `slot_days_ahead` dias à frente. Gravar telefone + status numa dessas linhas cria a consulta com a duração do procedimento; se o horário já foi tomado, responde 400 "esse horário acabou de ser ocupado" | status, data, procedimento, profissional, paciente (por telefone) e campos de controle (`lembrete1_em`, `nota`...) em `meta` |
| Pacientes | contatos + último atendimento, próximo agendamento e último procedimento calculados da agenda | nome, telefone, nascimento e controles em `meta` |
| Leads | contatos marcados como lead pelo B1 | novo lead cria contato + oportunidade em "Novo lead"; `agendado` move para "Avaliação agendada", `virou_paciente` para Fechado, `perdido` para Perdido |
| Optout | contatos sem consentimento + números sem cadastro | PARAR tira o consentimento |
| Espera | lista de espera (`waitlist`) | status e controles |
| Financeiro | cobranças (`charges`) | status (pago), link, etapa da cobrança |
| Log / Respostas | tabela `sheet_rows` | cada envio e cada resposta também entra na linha do tempo do paciente |

Cada linha traz a coluna `_row` (número estável do registro), e é ela que os fluxos usam nas gravações `Aba!ColunaLinha`. Academias não usam esse modo.

**Convênio (0008):** colunas novas entram depois de `_row`, para não mudar as letras das colunas já usadas: Agenda `pagamento` (particular|convenio), `convenio`, `guia`; Pacientes `convenio`, `carteirinha`; Leads `convenio`, `carteirinha`, `convenio_aceito` (sim|nao). Lead ou consulta com convênio que a clínica atende sai como convênio; a cobrança dele vence em 30 dias e **não aparece na aba Financeiro** (a régua de cobrança do paciente não cobra convênio).

---

## 4. Segurança e escala
- Toda tabela tem `clinic_id` e RLS: um usuário só lê clínicas das quais é membro; escrita exige clínica liberada. Gatilhos impedem referência a dados de outra clínica e impedem o cliente de mudar status/plano.
- Arquivos privados por clínica (`<clinic_id>/...`) com URLs assinadas de 1 hora.
- Service role só no servidor, depois de checar permissão. Cartão tokenizado no navegador (a Fluxa nunca vê o número).
- Webhook do Pagar.me com autenticação básica, idempotente (tabela `billing_events`) e confirmação do status direto na API.
- Limites mensais de IA por clínica (`ai_usage`), índices nas consultas principais, paginação nas listas.
- Testes de RLS: `supabase/tests/` (rodam num Postgres comum com o stub do Supabase).

## 5. Custos de infraestrutura (estimativa para começar)
Supabase Pro US$ 25/mês · Vercel Pro US$ 20/mês · Gemini: gratuito até o limite, depois por uso · Pagar.me: taxa por transação do seu contrato Stone · SMTP: gratuito até alguns milhares de e-mails/mês. Confira os preços atuais em cada serviço.

## 6. O que foi testado e o que falta testar
- **Testado aqui (0008):** celular (todas as telas em 390 px sem nada saindo da margem: tabelas viram cartões, agenda abre no modo Dia, formulários recolhidos, menu com botão de fechar); convênios de ponta a ponta no navegador (lista da clínica, convênio do paciente, consulta com guia, realizado gera cobrança do convênio em 30 dias, troca para particular, filtro no Financeiro, aba Financeiro da planilha sem convênio, lead pela planilha e pela API com convênio atendido e não atendido); NFS-e contra um servidor que imita a Sefin (certificado com senha errada, certificado cifrado, emissão a partir da cobrança, DPS assinada RSA-SHA256 com CPF/código/percentual, XSD oficial válido, PDF e XML, rejeição com código, cancelamento e101101 assinado); testes do banco de cobrança e clínica completa passam com o gatilho novo.
- **NFS-e: não testado contra a Sefin de verdade** (precisa do certificado A1 real da clínica). A biblioteca usada (`nfse-js` 0.3.0, MIT) valida as regras e o XSD oficiais, mas ainda não tem emissão real registrada pelo autor. Faça a primeira nota em Produção restrita e só depois mude para Produção.
- **Testado antes (0007):** agenda por profissional (horário próprio, procedimentos por profissional, capacidade da clínica, escolha automática do profissional livre, horários livres da API e do modo planilha com profissional, WhatsApp marcando num horário gerado recebe um profissional); cancelar pela API avisa o webhook da lista de espera uma vez só; orçamento (numeração por clínica, total com desconto, aprovação em 3x com entrada e vencimentos mensais, cartão 10x numa cobrança paga, oportunidade ganha, não aprova duas vezes); sessão do plano não cobra de novo; despesas só para dono/admin; ficha clínica e fotos só para quem tem acesso (banco e Storage), evolução sem edição, paciente excluído leva a ficha; PDF do orçamento e do recibo (valor por extenso); comissões e resultado do mês; lembrete de amanhã com link do WhatsApp; todas as telas novas abertas logadas (sessão simulada) sem erro. `supabase/tests/clinica_completa_test.sql` tem os testes do banco.
- **Testado antes:** cobrança da consulta (trigger no banco: realizado com valor cria cobrança vencendo hoje, sem duplicar; desfazer, faltou ou tirar o valor cancela a cobrança aberta; cobrança paga nunca é mexida; vale também quando a automação marca realizado pela API; C6 só cobra a partir do dia seguinte e para quando pago). Horário de atendimento e horários livres (cálculo com almoço, capacidade, duração por procedimento; lead do anúncio agenda pelo B1 num horário gerado, corrida de dois leads no mesmo horário recusada, C1 ignora horários livres; RLS da tabela de horários). O modo planilha com os fluxos B1, B3, C1 a C7 rodando de verdade contra a API (PostgREST + Postgres locais): lead de anúncio entra no CRM, recebe horários livres, agenda e anda no funil; confirmação, PARAR, cobrança, lista de espera e pós-atendimento gravam no sistema. As migrações SQL num Postgres 16 com um stub do Supabase (isolamento entre clínicas, bloqueio de escrita sem assinatura, convite, campos protegidos, Storage, criação pelo servidor); `tsc` e `next build` sem erros; renderização dos 5 modelos de arte.
- **Não testado:** clicar nos formulários novos no navegador com login real (as telas foram abertas, mas salvar orçamento, aprovar, lançar despesa, anamnese e upload de fotos foram testados pelo banco, não pelo clique); login real no Supabase, chamadas reais ao Gemini e ao Pagar.me, envio de e-mail. Faça o roteiro da seção 2 no modo de teste (sandbox) antes de vender.
- **Confirme na documentação do Pagar.me** os nomes dos eventos de webhook e o endpoint de tokenização de cartão da sua conta; o código lê os campos de forma tolerante e confirma o status direto na API, mas a integração não foi executada contra a conta real.

## 7. Desenvolvimento
```
cp .env.example .env.local   # preencha
npm install
npm run dev
npm run typecheck && npm run build
```
