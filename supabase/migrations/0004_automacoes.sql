-- =====================================================================
-- Fluxa SaaS — integração com as automações da biblioteca (n8n)
-- Rode depois de 0001–0003. Cada bloco pode ser rodado de novo sem erro.
-- =====================================================================

-- Novos status da agenda: horário livre (oferecido a leads) e pedido de remarcação.
alter type appt_status add value if not exists 'livre';
alter type appt_status add value if not exists 'remarcar';

-- Horário livre não tem paciente.
alter table public.appointments alter column contact_id drop not null;
alter table public.appointments drop constraint if exists appointments_contact_livre;
alter table public.appointments add constraint appointments_contact_livre check (contact_id is not null or status::text = 'livre');

-- Campos de controle das automações (lembrete enviado, nota, etc.) e número de linha estável
alter table public.appointments add column if not exists meta jsonb not null default '{}'::jsonb;
alter table public.appointments add column if not exists sheet_row int;
alter table public.contacts add column if not exists meta jsonb not null default '{}'::jsonb;
alter table public.contacts add column if not exists sheet_row int;

-- Lista de espera
create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  procedure_id uuid references public.procedures(id) on delete set null,
  procedure_text text,
  status text not null default 'aguardando' check (status in ('aguardando', 'ofertado', 'agendado', 'cancelado')),
  meta jsonb not null default '{}'::jsonb,
  sheet_row int,
  created_at timestamptz not null default now()
);
create index if not exists waitlist_clinic_idx on public.waitlist(clinic_id, status, created_at);

-- Financeiro (contas a receber dos pacientes)
create table if not exists public.charges (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  description text,
  amount numeric(12,2) not null check (amount >= 0),
  due_date date not null,
  status text not null default 'aberto' check (status in ('aberto', 'pago', 'cancelado')),
  payment_link text,
  paid_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  sheet_row int,
  created_at timestamptz not null default now()
);
create index if not exists charges_clinic_idx on public.charges(clinic_id, status, due_date);

-- Abas sem tabela própria (Log, Respostas e opt-out de números sem cadastro)
create table if not exists public.sheet_rows (
  id bigint generated always as identity primary key,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  tab text not null,
  sheet_row int,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists sheet_rows_tab_idx on public.sheet_rows(clinic_id, tab, sheet_row);

-- Numeração de linha por clínica (as automações endereçam "Aba!ColunaLinha")
create table if not exists public.clinic_counters (
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  tab text not null,
  last int not null default 1,
  primary key (clinic_id, tab)
);
alter table public.clinic_counters enable row level security;

create or replace function public.next_sheet_row(cid uuid, t text) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into clinic_counters (clinic_id, tab, last) values (cid, t, 2)
  on conflict (clinic_id, tab) do update set last = clinic_counters.last + 1
  returning last into n;
  return n;
end $$;
revoke execute on function public.next_sheet_row(uuid, text) from public, anon, authenticated;

create or replace function public.assign_sheet_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare k text;
begin
  if new.sheet_row is null then
    if tg_table_name = 'appointments' then k := 'agenda';
    elsif tg_table_name = 'contacts' then k := 'contatos';
    elsif tg_table_name = 'waitlist' then k := 'espera';
    elsif tg_table_name = 'charges' then k := 'financeiro';
    else k := 'tab:' || (to_jsonb(new) ->> 'tab');
    end if;
    new.sheet_row := public.next_sheet_row(new.clinic_id, k);
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['appointments','contacts','waitlist','charges','sheet_rows'] loop
    execute format('drop trigger if exists %I_sheet_row on public.%I', t, t);
    execute format('create trigger %I_sheet_row before insert on public.%I for each row execute function public.assign_sheet_row()', t, t);
  end loop;
end $$;

-- Numera o que já existe
with x as (select id, clinic_id, row_number() over (partition by clinic_id order by created_at, id) + 1 as rn from public.appointments where sheet_row is null)
update public.appointments a set sheet_row = x.rn from x where a.id = x.id;
with x as (select id, clinic_id, row_number() over (partition by clinic_id order by created_at, id) + 1 as rn from public.contacts where sheet_row is null)
update public.contacts a set sheet_row = x.rn from x where a.id = x.id;
insert into public.clinic_counters (clinic_id, tab, last)
  select clinic_id, 'agenda', max(sheet_row) from public.appointments group by clinic_id
  on conflict (clinic_id, tab) do update set last = greatest(clinic_counters.last, excluded.last);
insert into public.clinic_counters (clinic_id, tab, last)
  select clinic_id, 'contatos', max(sheet_row) from public.contacts group by clinic_id
  on conflict (clinic_id, tab) do update set last = greatest(clinic_counters.last, excluded.last);

create unique index if not exists appointments_sheet_row_uq on public.appointments(clinic_id, sheet_row);
create unique index if not exists contacts_sheet_row_uq on public.contacts(clinic_id, sheet_row);
create unique index if not exists waitlist_sheet_row_uq on public.waitlist(clinic_id, sheet_row);
create unique index if not exists charges_sheet_row_uq on public.charges(clinic_id, sheet_row);

-- Referências da mesma clínica (horário livre sem paciente; espera e financeiro)
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
      and (new.procedure_id is null or exists (select 1 from procedures where id = new.procedure_id and clinic_id = new.clinic_id));
  elsif tg_table_name in ('waitlist', 'charges') then
    ok := exists (select 1 from contacts where id = new.contact_id and clinic_id = new.clinic_id);
  elsif tg_table_name = 'creatives' then
    ok := new.brief_id is null or exists (select 1 from creative_briefs where id = new.brief_id and clinic_id = new.clinic_id);
  end if;
  if not ok then
    raise exception 'Referência de outra clínica não permitida';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['waitlist','charges'] loop
    execute format('drop trigger if exists %I_same_clinic on public.%I', t, t);
    execute format('create trigger %I_same_clinic before insert or update on public.%I for each row execute function public.ensure_same_clinic()', t, t);
  end loop;
end $$;

-- RLS das tabelas novas
alter table public.waitlist enable row level security;
alter table public.charges enable row level security;
alter table public.sheet_rows enable row level security;
do $$
declare t text;
begin
  foreach t in array array['waitlist','charges'] loop
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
drop policy if exists sheet_rows_select on public.sheet_rows;
create policy sheet_rows_select on public.sheet_rows for select to authenticated using (public.is_clinic_admin(clinic_id));
