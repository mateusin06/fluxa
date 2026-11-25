-- =====================================================================
-- Fluxa SaaS — horário de atendimento e horários livres automáticos
-- Rode depois de 0001–0004. Pode ser rodado de novo sem erro.
-- =====================================================================

-- Intervalos de atendimento por dia da semana (0 = domingo ... 6 = sábado).
-- Um dia pode ter vários intervalos (ex.: 08:00–12:00 e 13:30–18:00, com almoço no meio).
create table if not exists public.business_hours (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);
create index if not exists business_hours_clinic_idx on public.business_hours(clinic_id, weekday, start_time);

-- Como os horários livres são oferecidos pelo WhatsApp
alter table public.clinics add column if not exists slot_procedure_id uuid references public.procedures(id) on delete set null;
alter table public.clinics add column if not exists slot_minutes int not null default 30;
alter table public.clinics add column if not exists slot_capacity int not null default 1;
alter table public.clinics add column if not exists slot_days_ahead int not null default 21;
alter table public.clinics drop constraint if exists clinics_slot_minutes_chk;
alter table public.clinics add constraint clinics_slot_minutes_chk check (slot_minutes between 5 and 600);
alter table public.clinics drop constraint if exists clinics_slot_capacity_chk;
alter table public.clinics add constraint clinics_slot_capacity_chk check (slot_capacity between 1 and 20);
alter table public.clinics drop constraint if exists clinics_slot_days_chk;
alter table public.clinics add constraint clinics_slot_days_chk check (slot_days_ahead between 1 and 90);

-- Procedimento digitado à mão (fora da lista de Configurações) e preço da consulta
alter table public.appointments add column if not exists procedure_text text;
alter table public.appointments add column if not exists price numeric(12,2);
alter table public.appointments drop constraint if exists appointments_price_chk;
alter table public.appointments add constraint appointments_price_chk check (price is null or price >= 0);
alter table public.appointments drop constraint if exists appointments_procedure_text_chk;
alter table public.appointments add constraint appointments_procedure_text_chk check (procedure_text is null or char_length(procedure_text) <= 120);

-- O procedimento oferecido no WhatsApp tem que ser da mesma clínica
create or replace function public.ensure_clinic_slot_proc() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.slot_procedure_id is not null and not exists (select 1 from procedures where id = new.slot_procedure_id and clinic_id = new.id) then
    raise exception 'Referência de outra clínica não permitida';
  end if;
  return new;
end $$;
drop trigger if exists clinics_slot_proc on public.clinics;
create trigger clinics_slot_proc before insert or update of slot_procedure_id on public.clinics
  for each row execute function public.ensure_clinic_slot_proc();

-- RLS: toda a equipe vê; só dono/administrador (com a conta liberada) altera
alter table public.business_hours enable row level security;
drop policy if exists business_hours_select on public.business_hours;
create policy business_hours_select on public.business_hours for select to authenticated using (public.is_member(clinic_id));
drop policy if exists business_hours_insert on public.business_hours;
create policy business_hours_insert on public.business_hours for insert to authenticated
  with check (public.is_clinic_admin(clinic_id) and public.clinic_writable(clinic_id));
drop policy if exists business_hours_update on public.business_hours;
create policy business_hours_update on public.business_hours for update to authenticated
  using (public.is_clinic_admin(clinic_id) and public.clinic_writable(clinic_id))
  with check (public.is_clinic_admin(clinic_id) and public.clinic_writable(clinic_id));
drop policy if exists business_hours_delete on public.business_hours;
create policy business_hours_delete on public.business_hours for delete to authenticated
  using (public.is_clinic_admin(clinic_id) and public.clinic_writable(clinic_id));

-- Índice para achar rápido o que ocupa a agenda num período
drop index if exists public.appointments_busy_idx;
create index if not exists appointments_busy_idx on public.appointments(clinic_id, starts_at, ends_at);
