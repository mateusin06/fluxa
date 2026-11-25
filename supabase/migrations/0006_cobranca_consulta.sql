-- =====================================================================
-- Fluxa SaaS — consulta realizada vira cobrança no Financeiro
-- Rode depois de 0001–0005. Pode ser rodado de novo sem erro.
-- =====================================================================

alter table public.charges add column if not exists appointment_id uuid references public.appointments(id) on delete set null;
create unique index if not exists charges_appointment_uq on public.charges(appointment_id) where appointment_id is not null;
create index if not exists charges_paid_idx on public.charges(clinic_id, paid_at) where status = 'pago';

-- A cobrança da consulta é da mesma clínica e do mesmo paciente
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
  elsif tg_table_name = 'waitlist' then
    ok := exists (select 1 from contacts where id = new.contact_id and clinic_id = new.clinic_id);
  elsif tg_table_name = 'charges' then
    ok := exists (select 1 from contacts where id = new.contact_id and clinic_id = new.clinic_id)
      and (new.appointment_id is null or exists (select 1 from appointments where id = new.appointment_id and clinic_id = new.clinic_id and contact_id = new.contact_id));
  elsif tg_table_name = 'creatives' then
    ok := new.brief_id is null or exists (select 1 from creative_briefs where id = new.brief_id and clinic_id = new.clinic_id);
  end if;
  if not ok then
    raise exception 'Referência de outra clínica não permitida';
  end if;
  return new;
end $$;

-- Consulta com valor marcada como "realizado" → cobrança em aberto, vencendo hoje.
-- Saiu de "realizado" (marcou errado, faltou, cancelou) → a cobrança em aberto é cancelada.
-- Mudou o valor → a cobrança em aberto acompanha. Cobrança paga nunca é mexida.
create or replace function public.appointment_charge() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ch record;
  descr text;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if new.status = 'realizado' and new.contact_id is not null and coalesce(new.price, 0) > 0 then
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
    -- saiu de "realizado", ou ficou sem valor / sem paciente
    update charges set status = 'cancelado' where appointment_id = new.id and status = 'aberto';
  end if;
  return new;
end $$;

drop trigger if exists appointments_charge on public.appointments;
create trigger appointments_charge after insert or update of status, price, contact_id on public.appointments
  for each row execute function public.appointment_charge();
