# Alterações: clínica completa (migração 0007)

Rode no Supabase (SQL Editor) o arquivo `supabase/migrations/0007_clinica_completa.sql`, depois do 0006. Ele pode ser rodado de novo sem erro.
Depois, `npm install` (entrou a biblioteca `pdf-lib`, que gera os PDFs) e o deploy na Vercel.

## Arquivos novos
- `src/app/app/agenda/reminder.tsx`
- `src/app/app/contatos/[id]/ficha/actions.ts`
- `src/app/app/contatos/[id]/ficha/forms.tsx`
- `src/app/app/contatos/[id]/ficha/page.tsx`
- `src/app/app/financeiro/recibo/[id]/route.ts`
- `src/app/app/orcamentos/[id]/page.tsx`
- `src/app/app/orcamentos/[id]/pdf/route.ts`
- `src/app/app/orcamentos/actions.ts`
- `src/app/app/orcamentos/editor.tsx`
- `src/app/app/orcamentos/page.tsx`
- `src/components/pay-form.tsx`
- `src/lib/anamnese.ts`
- `src/lib/commission.ts`
- `src/lib/payments.ts`
- `src/lib/pdf.ts`
- `src/lib/reminder.ts`
- `src/lib/waitlist.ts`
- `supabase/migrations/0007_clinica_completa.sql`
- `supabase/tests/clinica_completa_test.sql`

## Arquivos alterados (substitua inteiro)
- `README.md`
- `package-lock.json`
- `package.json`
- `src/app/api/v1/appointments/[id]/route.ts`
- `src/app/api/v1/horarios-livres/route.ts`
- `src/app/app/agenda/actions.ts`
- `src/app/app/agenda/new-appt.tsx`
- `src/app/app/agenda/page.tsx`
- `src/app/app/configuracoes/actions.ts`
- `src/app/app/configuracoes/forms.tsx`
- `src/app/app/configuracoes/hours.tsx`
- `src/app/app/configuracoes/page.tsx`
- `src/app/app/contatos/[id]/forms.tsx`
- `src/app/app/contatos/[id]/page.tsx`
- `src/app/app/crm-actions.ts`
- `src/app/app/financeiro/actions.ts`
- `src/app/app/financeiro/form.tsx`
- `src/app/app/financeiro/page.tsx`
- `src/app/app/page.tsx`
- `src/app/globals.css`
- `src/components/app/nav.tsx`
- `src/lib/planilha.ts`
- `src/lib/schedule.ts`
- `src/lib/slots.ts`
- `src/lib/types.ts`

Nenhum arquivo foi removido.
