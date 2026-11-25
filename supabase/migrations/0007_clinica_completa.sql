-- =====================================================================
-- Fluxa SaaS — clínica completa
--  1. agenda por profissional   2. forma de pagamento e parcelas
--  3. orçamento / plano de tratamento   4. despesas
--  5. aviso de vaga ao n8n   6. ficha do paciente   7. recibo (CPF do paciente)
--  8. comissão   9. lembrete manual
-- Rode depois de 0001–0006. Pode ser rodado de novo sem erro.
-- =====================================================================

-- ---------- 1. Agenda por profissional ----------------------------------
-- "Atende na agenda": profissional cadastrado só para os criativos não recebe consulta.
alter table public.professionals add column if not exists attends boolean not null default true;
alter table public.professionals add column if not exists commission_pct numeric(5,2);
alter table public.professionals drop constraint if exists professionals_commission_chk;
alter table public.professionals add constraint professionals_commission_chk check (commission_pct is null or commission_pct between 0 and 100);

-- Horário próprio do profissional. Sem linhas próprias, ele segue o horário da clínica.
alter table public.business_hours add column if not exists professional_id uuid references public.professionals(id) on delete cascade;
create index if not exists business_hours_prof_idx on public.business_hours(clinic_id, professional_id, weekday);

-- Procedimentos que cada profissional faz (nenhum marcado = faz todos) e comissão específica
create table if not exists public.professional_procedures (
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  professional_id uuid not null references public.professionals(id) on delete cascade,
  procedure_id uuid not null references public.procedures(id) on delete cascade,
  commission_pct numeric(5,2) check (commission_pct is null or commission_pct between 0 and 100),
  primary key (professional_id, procedure_id)
);
create index if not exists professional_procedures_clinic_idx on public.professional_procedures(clinic_id);
create index if not exists appointments_prof_time_idx on public.appointments(clinic_id, professional_id, starts_at);

-- ---------- 3. Orçamento / plano de tratamento ---------------------------
create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  professional_id uuid references public.professionals(id) on delete set null,
  deal_id uuid references public.deals(id) on delete set null,
  number int,
  status text not null default 'rascunho' check (status in ('rascunho', 'enviado', 'aprovado', 'recusado')),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  notes text check (notes is null or char_length(notes) <= 2000),
  valid_until date,
  sent_at timestamptz,
  approved_at timestamptz,
  refused_reason text,
  payment jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists quotes_number_uq on public.quotes(clinic_id, number);
create index if not exists quotes_contact_idx on public.quotes(contact_id, created_at desc);
create index if not exists quotes_clinic_idx on public.quotes(clinic_id, status, created_at desc);

create table if not exists public.quote_items (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  procedure_id uuid references public.procedures(id) on delete set null,
  description text not null check (char_length(description) between 1 and 160),
  region text check (region is null or char_length(region) <= 60),   -- dente / região
  qty int not null default 1 check (qty between 1 and 99),           -- sessões
  unit_price numeric(12,2) not null default 0 check (unit_price >= 0),
  position int not null default 0
);
create index if not exists quote_items_quote_idx on public.quote_items(quote_id, position);

-- Número do orçamento por clínica (1, 2, 3...)
create or replace function public.assign_quote_number() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.number is null then
    insert into clinic_counters (clinic_id, tab, last) values (new.clinic_id, 'orcamento', 1)
    on conflict (clinic_id, tab) do update set last = clinic_counters.last + 1
    returning last into new.number;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists quotes_number on public.quotes;
create trigger quotes_number before insert or update on public.quotes for each row execute function public.assign_quote_number();

create or replace function public.quote_total(q uuid) returns numeric
language sql stable security invoker set search_path = public as $$
  select greatest(0, coalesce((select sum(qty * unit_price) from quote_items where quote_id = q), 0)
                    - coalesce((select discount from quotes where id = q), 0));
$$;

-- Sessão agendada a partir do plano (já cobrada pelo orçamento: não gera cobrança de novo)
alter table public.appointments add column if not exists quote_item_id uuid references public.quote_items(id) on delete set null;
create index if not exists appointments_quote_item_idx on public.appointments(quote_item_id) where quote_item_id is not null;

-- ---------- 2. Forma de pagamento e parcelas -----------------------------
alter table public.charges add column if not exists payment_method text;
alter table public.charges drop constraint if exists charges_method_chk;
alter table public.charges add constraint charges_method_chk check (payment_method is null or payment_method in ('pix', 'dinheiro', 'credito', 'debito', 'boleto', 'transferencia', 'outro'));
alter table public.charges add column if not exists installments smallint not null default 1;
alter table public.charges drop constraint if exists charges_installments_chk;
alter table public.charges add constraint charges_installments_chk check (installments between 1 and 24);
alter table public.charges add column if not exists quote_id uuid references public.quotes(id) on delete set null;
alter table public.charges add column if not exists installment_no smallint;
alter table public.charges add column if not exists installment_of smallint;
create index if not exists charges_quote_idx on public.charges(quote_id) where quote_id is not null;

-- ---------- 4. Despesas ---------------------------------------------------
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  description text not null check (char_length(description) between 1 and 200),
  category text not null default 'outros' check (category in ('aluguel', 'material', 'laboratorio', 'salarios', 'comissao', 'impostos', 'marketing', 'servicos', 'outros')),
  amount numeric(12,2) not null check (amount > 0),
  due_date date not null,
  status text not null default 'aberto' check (status in ('aberto', 'pago', 'cancelado')),
  paid_at timestamptz,
  payment_method text check (payment_method is null or payment_method in ('pix', 'dinheiro', 'credito', 'debito', 'boleto', 'transferencia', 'outro')),
  professional_id uuid references public.professionals(id) on delete set null,
  meta jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists expenses_clinic_idx on public.expenses(clinic_id, status, due_date);
create index if not exists expenses_paid_idx on public.expenses(clinic_id, paid_at) where status = 'pago';

-- ---------- 5 e 9. Configurações da clínica ------------------------------
alter table public.clinics add column if not exists waitlist_webhook_url text;
alter table public.clinics add column if not exists reminder_template text;
alter table public.clinics drop constraint if exists clinics_waitlist_url_chk;
alter table public.clinics add constraint clinics_waitlist_url_chk check (waitlist_webhook_url is null or waitlist_webhook_url ~ '^https://');

-- ---------- 7. CPF do paciente (recibo para reembolso) -------------------
alter table public.contacts add column if not exists document text;
alter table public.contacts drop constraint if exists contacts_document_chk;
alter table public.contacts add constraint contacts_document_chk check (document is null or char_length(document) <= 20);

-- ---------- 6. Ficha do paciente ------------------------------------------
-- Quem vê a ficha: o dono sempre; os outros só com "acesso à ficha clínica" ligado em Equipe.
alter table public.memberships add column if not exists clinical_access boolean not null default false;

create or replace function public.can_clinical(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships m where m.clinic_id = cid and m.user_id = auth.uid() and (m.role = 'owner' or m.clinical_access));
$$;

create table if not exists public.anamneses (
  contact_id uuid primary key references public.contacts(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create table if not exists public.clinical_notes (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete set null,
  professional_id uuid references public.professionals(id) on delete set null,
  body text not null check (char_length(body) between 1 and 5000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists clinical_notes_contact_idx on public.clinical_notes(contact_id, created_at desc);
create table if not exists public.patient_files (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  path text not null,
  caption text check (caption is null or char_length(caption) <= 200),
  taken_at date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists patient_files_contact_idx on public.patient_files(contact_id, created_at desc);

-- ---------- Referências sempre da mesma clínica ---------------------------
create or replace function public.ensure_same_clinic() returns trigger
language plpgsql security definer set search_path = public as $$
declare ok boolean := true;
begin
  if tg_table_name = 'deals' then
    ok := exists (select 1 from contacts where id = new.contact_id and clinic_id = new.clinic_id)
      and exists (select 1 from stages where id = new.stage_id and clinic_id = new.clinic_id)
      and (new.procedure_id is null or exists (select 1 from procedures where id = new.procedure_id and clinic_id = new.clinic_id));
  elsif tg_table_name = 'activities' then
    ok := (new.contact_id is null or exists (select 1 from contacts where id = new.contact_id and clinic_id = new.clinic_id))
      and (new.deal_id is null or exists (select 1 from deals where id = new.deal_id and clinic_id = new.clinic_id));
  elsif tg_table_name = 'appointments' then
    ok := (new.contact_id is null or exists (select 1 from contacts where id = new.contact_id and clinic_id = new.clinic_id))
      and (new.professional_id is null or exists (select 1 from professionals where id = new.professional_id and clinic_id = new.clinic_id))
      and (new.procedure_id is null or exists (select 1 from procedures where id = new.procedure_id and clinic_id = new.clinic_id))
      and (new.quote_item_id is null or exists (select 1 from quote_items i join quotes q on q.id = i.quote_id where i.id = new.quote_item_id and q.clinic_id = new.clinic_id and q.contact_id = new.contact_id));
  elsif tg_table_name = 'waitlist' then
    ok := exists (select 1 from contacts where id = new.contact_id and clinic_id = new.clinic_id);
  elsif tg_table_name = 'charges' then
    ok := exists (select 1 from contacts where id = new.contact_id and clinic_id = new.clinic_id)
      and (new.appointment_id is null or exists (select 1 from appointments where id = new.appointment_id and clinic_id = new.clinic_id and contact_id = new.contact_id))
      and (new.quote_id is null or exists (select 1 from quotes where id = new.quote_id and clinic_id = new.clinic_id and contact_id = new.contact_id));
  elsif tg_table_name = 'creatives' then
    ok := new.brief_id is null or exists (select 1 from creative_briefs where id = new.brief_id and clinic_id = new.clinic_id);
  elsif tg_table_name = 'business_hours' then
    ok := new.professional_id is null or exists (select 1 from professionals where id = new.professional_id and clinic_id = new.clinic_id);
  elsif tg_table_name = 'professional_procedures' then
    ok := exists (select 1 from professionals where id = new.professional_id and clinic_id = new.clinic_id)
      and exists (select 1 from procedures where id = new.procedure_id and clinic_id = new.clinic_id);
  elsif tg_table_name = 'quotes' then
    ok := exists (select 1 from contacts where id = new.contact_id and clinic_id = new.clinic_id)
      and (new.professional_id is null or exists (select 1 from professionals where id = new.professional_id and clinic_id = new.clinic_id))
      and (new.deal_id is null or exists (select 1 from deals where id = new.deal_id and clinic_id = new.clinic_id and contact_id = new.contact_id));
  elsif tg_table_name = 'quote_items' then
    ok := exists (select 1 from quotes where id = new.quote_id and clinic_id = new.clinic_id)
      and (new.procedure_id is null or exists (select 1 from procedures where id = new.procedure_id and clinic_id = new.clinic_id));
  elsif tg_table_name = 'expenses' then
    ok := new.professional_id is null or exists (select 1 from professionals where id = new.professional_id and clinic_id = new.clinic_id);
  elsif tg_table_name in ('anamneses', 'clinical_notes', 'patient_files') then
    ok := exists (select 1 from contacts where id = new.contact_id and clinic_id = new.clinic_id);
    if ok and tg_table_name = 'clinical_notes' then
      ok := (new.appointment_id is null or exists (select 1 from appointments where id = new.appointment_id and clinic_id = new.clinic_id))
        and (new.professional_id is null or exists (select 1 from professionals where id = new.professional_id and clinic_id = new.clinic_id));
    end if;
    if ok and tg_table_name = 'patient_files' then
      ok := split_part(new.path, '/', 1) = new.clinic_id::text and split_part(new.path, '/', 2) = 'pacientes' and split_part(new.path, '/', 3) = new.contact_id::text;
    end if;
  end if;
  if not ok then
    raise exception 'Referência de outra clínica não permitida';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['business_hours','professional_procedures','quotes','quote_items','expenses','anamneses','clinical_notes','patient_files'] loop
    execute format('drop trigger if exists %I_same_clinic on public.%I', t, t);
    execute format('create trigger %I_same_clinic before insert or update on public.%I for each row execute function public.ensure_same_clinic()', t, t);
  end loop;
end $$;

-- ---------- Consulta realizada → cobrança (sessão de plano não cobra de novo)
create or replace function public.appointment_charge() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ch record;
  descr text;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if new.status = 'realizado' and new.contact_id is not null and coalesce(new.price, 0) > 0 and new.quote_item_id is null then
    select id, status, amount into ch from charges where appointment_id = new.id;
    if not found then
      select coalesce((select name from procedures where id = new.procedure_id), new.procedure_text, 'Consulta') into descr;
      insert into charges (clinic_id, contact_id, appointment_id, description, amount, due_date, status)
      values (new.clinic_id, new.contact_id, new.id, descr || ' (' || to_char(new.starts_at at time zone 'America/Sao_Paulo', 'DD/MM') || ')', new.price, hoje, 'aberto');
    elsif ch.status = 'cancelado' then
      update charges set status = 'aberto', amount = new.price, due_date = hoje, paid_at = null where id = ch.id;
    elsif ch.status = 'aberto' and ch.amount is distinct from new.price then
      update charges set amount = new.price where id = ch.id;
    end if;
  elsif tg_op = 'UPDATE' and (old.status = 'realizado' or new.status = 'realizado') then
    update charges set status = 'cancelado' where appointment_id = new.id and status = 'aberto';
  end if;
  return new;
end $$;
drop trigger if exists appointments_charge on public.appointments;
create trigger appointments_charge after insert or update of status, price, contact_id, quote_item_id on public.appointments
  for each row execute function public.appointment_charge();

-- ---------- Aprovar orçamento: parcelas no Financeiro e oportunidade ganha (tudo junto)
-- Cartão de crédito: uma cobrança paga, com o número de parcelas da maquininha.
-- Outras formas: N cobranças mensais; a primeira pode entrar já paga (entrada).
create or replace function public.approve_quote(p_quote uuid, p_method text, p_installments int, p_first_due date, p_first_paid boolean default false)
returns numeric
language plpgsql security invoker set search_path = public as $$
declare
  q record; total numeric; n int := greatest(1, least(24, coalesce(p_installments, 1)));
  part numeric; i int; won uuid; descr text;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select * into q from quotes where id = p_quote for update;
  if not found then raise exception 'Orçamento não encontrado'; end if;
  if q.status not in ('rascunho', 'enviado') then raise exception 'Esse orçamento já foi %', q.status; end if;
  if p_method is not null and p_method not in ('pix', 'dinheiro', 'credito', 'debito', 'boleto', 'transferencia', 'outro') then raise exception 'Forma de pagamento inválida'; end if;
  total := quote_total(p_quote);
  descr := 'Orçamento nº ' || q.number;
  if total > 0 then
    if p_method in ('credito', 'debito') or n = 1 and p_first_paid then
      insert into charges (clinic_id, contact_id, quote_id, description, amount, due_date, status, paid_at, payment_method, installments)
      values (q.clinic_id, q.contact_id, q.id, descr, total, hoje, 'pago', now(), p_method, case when p_method = 'credito' then n else 1 end);
    else
      part := trunc(total / n, 2);
      for i in 1..n loop
        insert into charges (clinic_id, contact_id, quote_id, description, amount, due_date, status, paid_at, payment_method, installment_no, installment_of)
        values (q.clinic_id, q.contact_id, q.id, descr || case when n > 1 then ' · parcela ' || i || '/' || n else '' end,
                case when i = n then total - part * (n - 1) else part end,
                (coalesce(p_first_due, hoje) + make_interval(months => i - 1))::date,
                case when i = 1 and p_first_paid then 'pago' else 'aberto' end,
                case when i = 1 and p_first_paid then now() end,
                p_method, case when n > 1 then i end, case when n > 1 then n end);
      end loop;
    end if;
  end if;
  update quotes set status = 'aprovado', approved_at = now(),
    payment = jsonb_build_object('forma', p_method, 'parcelas', n, 'primeiro_vencimento', coalesce(p_first_due, hoje), 'entrada_paga', coalesce(p_first_paid, false), 'total', total)
  where id = p_quote;
  select id into won from stages where clinic_id = q.clinic_id and kind = 'won' order by position limit 1;
  if won is not null then
    if q.deal_id is not null then
      update deals set stage_id = won, value = total where id = q.deal_id and stage_id <> won;
      update deals set value = total where id = q.deal_id;
    else
      insert into deals (clinic_id, contact_id, stage_id, title, value, closed_at, owner_id)
      values (q.clinic_id, q.contact_id, won, descr, total, now(), auth.uid()) returning id into won;
      update quotes set deal_id = won where id = p_quote;
    end if;
  end if;
  insert into activities (clinic_id, contact_id, type, body, user_id)
  values (q.clinic_id, q.contact_id, 'sistema', descr || ' aprovado: ' || to_char(total, 'FM999G999G990D00') || ' em ' || n || 'x.', auth.uid());
  return total;
end $$;
grant execute on function public.approve_quote(uuid, text, int, date, boolean) to authenticated;
grant execute on function public.quote_total(uuid) to authenticated;

-- ---------- RLS das tabelas novas ----------------------------------------
alter table public.professional_procedures enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
alter table public.expenses enable row level security;
alter table public.anamneses enable row level security;
alter table public.clinical_notes enable row level security;
alter table public.patient_files enable row level security;

-- Orçamentos: toda a equipe (recepção monta e envia)
do $$
declare t text;
begin
  foreach t in array array['quotes','quote_items'] loop
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format('create policy %I_select on public.%I for select to authenticated using (public.is_member(clinic_id))', t, t);
    execute format('drop policy if exists %I_insert on public.%I', t, t);
    execute format('create policy %I_insert on public.%I for insert to authenticated with check (public.can_write(clinic_id))', t, t);
    execute format('drop policy if exists %I_update on public.%I', t, t);
    execute format('create policy %I_update on public.%I for update to authenticated using (public.can_write(clinic_id)) with check (public.can_write(clinic_id))', t, t);
    execute format('drop policy if exists %I_delete on public.%I', t, t);
    execute format('create policy %I_delete on public.%I for delete to authenticated using (public.can_write(clinic_id))', t, t);
  end loop;
end $$;

-- Procedimentos por profissional: equipe vê; dono/admin altera
drop policy if exists professional_procedures_select on public.professional_procedures;
create policy professional_procedures_select on public.professional_procedures for select to authenticated using (public.is_member(clinic_id));
drop policy if exists professional_procedures_write on public.professional_procedures;
create policy professional_procedures_write on public.professional_procedures for all to authenticated
  using (public.is_clinic_admin(clinic_id) and public.clinic_writable(clinic_id))
  with check (public.is_clinic_admin(clinic_id) and public.clinic_writable(clinic_id));

-- Despesas (salários, comissões): só dono/admin
drop policy if exists expenses_select on public.expenses;
create policy expenses_select on public.expenses for select to authenticated using (public.is_clinic_admin(clinic_id));
drop policy if exists expenses_write on public.expenses;
create policy expenses_write on public.expenses for all to authenticated
  using (public.is_clinic_admin(clinic_id) and public.clinic_writable(clinic_id))
  with check (public.is_clinic_admin(clinic_id) and public.clinic_writable(clinic_id));

-- Ficha clínica: só quem tem acesso clínico. Evolução não é editada nem apagada (fica o histórico).
drop policy if exists anamneses_all on public.anamneses;
create policy anamneses_all on public.anamneses for all to authenticated
  using (public.can_clinical(clinic_id))
  with check (public.can_clinical(clinic_id) and public.clinic_writable(clinic_id));
drop policy if exists clinical_notes_select on public.clinical_notes;
create policy clinical_notes_select on public.clinical_notes for select to authenticated using (public.can_clinical(clinic_id));
drop policy if exists clinical_notes_insert on public.clinical_notes;
create policy clinical_notes_insert on public.clinical_notes for insert to authenticated
  with check (public.can_clinical(clinic_id) and public.clinic_writable(clinic_id) and created_by = auth.uid());
drop policy if exists patient_files_select on public.patient_files;
create policy patient_files_select on public.patient_files for select to authenticated using (public.can_clinical(clinic_id));
drop policy if exists patient_files_insert on public.patient_files;
create policy patient_files_insert on public.patient_files for insert to authenticated
  with check (public.can_clinical(clinic_id) and public.clinic_writable(clinic_id));
drop policy if exists patient_files_delete on public.patient_files;
create policy patient_files_delete on public.patient_files for delete to authenticated
  using (public.can_clinical(clinic_id) and public.clinic_writable(clinic_id));

-- Fotos do paciente no Storage: pasta <clinica>/pacientes/... só para quem tem acesso clínico
drop policy if exists clinic_files_select on storage.objects;
create policy clinic_files_select on storage.objects for select to authenticated
  using (bucket_id = 'clinic-files' and public.is_member(public.path_clinic(name))
         and (split_part(name, '/', 2) <> 'pacientes' or public.can_clinical(public.path_clinic(name))));
drop policy if exists clinic_files_insert on storage.objects;
create policy clinic_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'clinic-files' and public.can_write(public.path_clinic(name))
              and (split_part(name, '/', 2) <> 'pacientes' or public.can_clinical(public.path_clinic(name))));
drop policy if exists clinic_files_update on storage.objects;
create policy clinic_files_update on storage.objects for update to authenticated
  using (bucket_id = 'clinic-files' and public.can_write(public.path_clinic(name))
         and (split_part(name, '/', 2) <> 'pacientes' or public.can_clinical(public.path_clinic(name))));
drop policy if exists clinic_files_delete on storage.objects;
create policy clinic_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'clinic-files' and public.can_write(public.path_clinic(name))
         and (split_part(name, '/', 2) <> 'pacientes' or public.can_clinical(public.path_clinic(name))));

-- Só dono/admin muda o acesso clínico de alguém (a política de memberships já exige admin);
-- ninguém dá acesso a si mesmo sem ser dono/admin.
create or replace function public.protect_clinical_access() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.clinical_access is distinct from old.clinical_access and auth.uid() is not null and not public.is_clinic_admin(new.clinic_id) then
    raise exception 'Apenas dono ou administrador muda o acesso à ficha clínica';
  end if;
  return new;
end $$;
drop trigger if exists memberships_clinical on public.memberships;
create trigger memberships_clinical before update on public.memberships for each row execute function public.protect_clinical_access();

grant execute on function public.can_clinical(uuid) to authenticated;

-- Permissões das tabelas novas (o Supabase já dá por padrão; aqui fica explícito)
grant select, insert, update, delete on public.professional_procedures, public.quotes, public.quote_items, public.expenses, public.anamneses, public.clinical_notes, public.patient_files to authenticated;
grant all on public.professional_procedures, public.quotes, public.quote_items, public.expenses, public.anamneses, public.clinical_notes, public.patient_files to service_role;
