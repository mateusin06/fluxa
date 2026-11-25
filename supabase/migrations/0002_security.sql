-- =====================================================================
-- Fluxa SaaS — funções, gatilhos e segurança (RLS)
-- =====================================================================

-- ---------- Funções de apoio (security definer, sem recursão de RLS) ------
create or replace function public.is_member(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships m where m.clinic_id = cid and m.user_id = auth.uid());
$$;

create or replace function public.member_role_of(cid uuid) returns member_role
language sql stable security definer set search_path = public as $$
  select m.role from public.memberships m where m.clinic_id = cid and m.user_id = auth.uid();
$$;

create or replace function public.is_clinic_admin(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.member_role_of(cid) in ('owner', 'admin'), false);
$$;

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_platform_admin from public.profiles p where p.id = auth.uid()), false);
$$;

-- A clínica pode gravar? (teste ativo, assinatura ativa ou até 7 dias de atraso)
create or replace function public.clinic_writable(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.clinics c
    where c.id = cid and (
      (c.status = 'trial' and c.trial_ends_at > now())
      or c.status = 'active'
      or (c.status = 'past_due' and coalesce(c.past_due_since, now()) > now() - interval '7 days')
    )
  );
$$;

create or replace function public.can_write(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_member(cid) and public.clinic_writable(cid);
$$;

-- Primeira pasta do caminho no Storage = id da clínica (sem erro se não for uuid)
create or replace function public.path_clinic(path text) returns uuid
language plpgsql immutable as $$
begin
  return split_part(path, '/', 1)::uuid;
exception when others then
  return null;
end $$;

create or replace function public.ai_usage_this_month(cid uuid, k text) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.ai_usage u
  where u.clinic_id = cid and u.kind = k and u.created_at >= date_trunc('month', now());
$$;

-- ---------- Perfil automático ao criar usuário -----------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), new.raw_user_meta_data->>'phone')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------- Campos que só o servidor muda ---------------------------------
create or replace function public.protect_clinic_billing() returns trigger
language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.status is distinct from old.status
       or new.plan is distinct from old.plan
       or new.trial_ends_at is distinct from old.trial_ends_at
       or new.past_due_since is distinct from old.past_due_since
       or new.source is distinct from old.source
       or new.owner_id is distinct from old.owner_id then
      raise exception 'Campos de assinatura só podem ser alterados pelo sistema';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists clinics_protect on public.clinics;
create trigger clinics_protect before update on public.clinics
for each row execute function public.protect_clinic_billing();

create or replace function public.protect_profile_admin() returns trigger
language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') and new.is_platform_admin is distinct from old.is_platform_admin then
    raise exception 'Operação não permitida';
  end if;
  return new;
end $$;
drop trigger if exists profiles_protect on public.profiles;
create trigger profiles_protect before update on public.profiles
for each row execute function public.protect_profile_admin();

-- Pedido de automação feito pela clínica: valores e status fixos
create or replace function public.protect_automation_request() returns trigger
language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.status := 'solicitado';
    new.setup_cents := 79700;
    new.monthly_cents := 39700;
    new.requested_by := auth.uid();
  end if;
  return new;
end $$;
drop trigger if exists automation_requests_protect on public.automation_requests;
create trigger automation_requests_protect before insert on public.automation_requests
for each row execute function public.protect_automation_request();

-- ---------- Referências sempre da mesma clínica ----------------------------
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
    ok := exists (select 1 from contacts where id = new.contact_id and clinic_id = new.clinic_id)
      and (new.professional_id is null or exists (select 1 from professionals where id = new.professional_id and clinic_id = new.clinic_id))
      and (new.procedure_id is null or exists (select 1 from procedures where id = new.procedure_id and clinic_id = new.clinic_id));
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
  foreach t in array array['deals','activities','appointments','creatives'] loop
    execute format('drop trigger if exists %I_same_clinic on public.%I', t, t);
    execute format('create trigger %I_same_clinic before insert or update on public.%I for each row execute function public.ensure_same_clinic()', t, t);
  end loop;
end $$;

-- Mudança de etapa vira atividade na linha do tempo + data de fechamento
create or replace function public.log_deal_stage() returns trigger
language plpgsql security definer set search_path = public as $$
declare k stage_kind; n text;
begin
  if tg_op = 'UPDATE' and new.stage_id is distinct from old.stage_id then
    select kind, name into k, n from stages where id = new.stage_id;
    new.closed_at := case when k in ('won', 'lost') then now() else null end;
    insert into activities (clinic_id, contact_id, deal_id, type, body, user_id)
    values (new.clinic_id, new.contact_id, new.id, 'etapa', 'Etapa: ' || n, auth.uid());
  end if;
  return new;
end $$;
drop trigger if exists deals_stage_log on public.deals;
create trigger deals_stage_log before update on public.deals
for each row execute function public.log_deal_stage();

-- ---------- Dados iniciais de cada clínica ---------------------------------
create or replace function public.seed_clinic(cid uuid, k clinic_kind) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into stages (clinic_id, name, position, kind, color) values
    (cid, 'Novo lead', 0, 'open', '#64748B'),
    (cid, 'Em conversa', 1, 'open', '#0EA5E9'),
    (cid, 'Avaliação agendada', 2, 'open', '#F59E0B'),
    (cid, 'Orçamento enviado', 3, 'open', '#8B5CF6'),
    (cid, 'Fechado', 4, 'won', '#16A34A'),
    (cid, 'Perdido', 5, 'lost', '#DC2626');

  if k = 'odonto' then
    insert into procedures (clinic_id, name, category, duration_min, return_days) values
      (cid, 'Avaliação', 'Clínico geral', 30, null),
      (cid, 'Limpeza (profilaxia)', 'Prevenção', 45, 180),
      (cid, 'Clareamento', 'Estética', 60, 365),
      (cid, 'Restauração', 'Dentística', 60, null),
      (cid, 'Tratamento de canal', 'Endodontia', 90, 30),
      (cid, 'Implante', 'Implantodontia', 120, 90),
      (cid, 'Aparelho / alinhadores', 'Ortodontia', 60, 30),
      (cid, 'Lentes / facetas', 'Estética', 120, 180);
  else
    insert into procedures (clinic_id, name, category, duration_min, return_days) values
      (cid, 'Avaliação', 'Geral', 30, null),
      (cid, 'Limpeza de pele', 'Facial', 60, 30),
      (cid, 'Toxina botulínica', 'Injetáveis', 45, 120),
      (cid, 'Preenchimento', 'Injetáveis', 60, 180),
      (cid, 'Bioestimulador', 'Injetáveis', 60, 90),
      (cid, 'Depilação a laser', 'Laser', 30, 30),
      (cid, 'Drenagem linfática', 'Corporal', 60, 7),
      (cid, 'Peeling', 'Facial', 45, 30);
  end if;
end $$;

-- Criar clínica (onboarding). Até 5 clínicas por usuário.
create or replace function public.create_clinic(p_name text, p_kind clinic_kind, p_phone text default null, p_city text default null, p_state text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare cid uuid; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Faça login'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Informe o nome da clínica'; end if;
  if (select count(*) from memberships where user_id = uid and role = 'owner') >= 5 then
    raise exception 'Limite de clínicas por usuário atingido';
  end if;
  insert into clinics (name, kind, phone, whatsapp, city, state, owner_id)
  values (trim(p_name), p_kind, p_phone, p_phone, p_city, p_state, uid)
  returning id into cid;
  insert into memberships (clinic_id, user_id, role) values (cid, uid, 'owner');
  insert into subscriptions (clinic_id, provider, status) values (cid, 'pagarme', 'pending');
  perform seed_clinic(cid, p_kind);
  return cid;
end $$;

-- Aceitar convite
create or replace function public.accept_invite(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv invites; uid uuid := auth.uid(); em text;
begin
  if uid is null then raise exception 'Faça login'; end if;
  select * into inv from invites where token = p_token and accepted_at is null and expires_at > now();
  if not found then raise exception 'Convite inválido ou expirado'; end if;
  select email into em from auth.users where id = uid;
  if lower(em) <> lower(inv.email) then raise exception 'Este convite é para outro e-mail'; end if;
  insert into memberships (clinic_id, user_id, role) values (inv.clinic_id, uid, inv.role)
  on conflict (clinic_id, user_id) do update set role = excluded.role;
  update invites set accepted_at = now() where id = inv.id;
  return inv.clinic_id;
end $$;

-- ---------- RLS ------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.clinics enable row level security;
alter table public.memberships enable row level security;
alter table public.invites enable row level security;
alter table public.stages enable row level security;
alter table public.contacts enable row level security;
alter table public.procedures enable row level security;
alter table public.professionals enable row level security;
alter table public.deals enable row level security;
alter table public.activities enable row level security;
alter table public.appointments enable row level security;
alter table public.creative_briefs enable row level security;
alter table public.creatives enable row level security;
alter table public.copies enable row level security;
alter table public.campaigns enable row level security;
alter table public.ai_usage enable row level security;
alter table public.subscriptions enable row level security;
alter table public.billing_events enable row level security;
alter table public.automation_requests enable row level security;
alter table public.api_keys enable row level security;
alter table public.audit_log enable row level security;

-- perfis: o próprio, ou colegas de clínica (para mostrar nomes)
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid() or exists (
    select 1 from public.memberships a join public.memberships b on a.clinic_id = b.clinic_id
    where a.user_id = auth.uid() and b.user_id = profiles.id)
);
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists clinics_select on public.clinics;
create policy clinics_select on public.clinics for select to authenticated using (public.is_member(id));
drop policy if exists clinics_update on public.clinics;
create policy clinics_update on public.clinics for update to authenticated using (public.is_clinic_admin(id)) with check (public.is_clinic_admin(id));

drop policy if exists memberships_select on public.memberships;
create policy memberships_select on public.memberships for select to authenticated using (public.is_member(clinic_id));
drop policy if exists memberships_update on public.memberships;
create policy memberships_update on public.memberships for update to authenticated
  using (public.member_role_of(clinic_id) = 'owner' and role <> 'owner')
  with check (public.member_role_of(clinic_id) = 'owner' and role <> 'owner');
drop policy if exists memberships_delete on public.memberships;
create policy memberships_delete on public.memberships for delete to authenticated
  using ((public.member_role_of(clinic_id) = 'owner' and role <> 'owner') or (user_id = auth.uid() and role <> 'owner'));

drop policy if exists invites_all on public.invites;
create policy invites_all on public.invites for all to authenticated
  using (public.is_clinic_admin(clinic_id)) with check (public.is_clinic_admin(clinic_id) and public.clinic_writable(clinic_id));

-- tabelas de dados: leitura para membros; escrita para membros com clínica liberada
do $$
declare t text;
begin
  foreach t in array array['stages','contacts','procedures','professionals','deals','activities','appointments','creative_briefs','creatives','copies','campaigns'] loop
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

-- etapas do funil: só dono/admin altera a estrutura
drop policy if exists stages_insert on public.stages;
create policy stages_insert on public.stages for insert to authenticated with check (public.can_write(clinic_id) and public.is_clinic_admin(clinic_id));
drop policy if exists stages_update on public.stages;
create policy stages_update on public.stages for update to authenticated using (public.can_write(clinic_id) and public.is_clinic_admin(clinic_id)) with check (public.can_write(clinic_id) and public.is_clinic_admin(clinic_id));
drop policy if exists stages_delete on public.stages;
create policy stages_delete on public.stages for delete to authenticated using (public.can_write(clinic_id) and public.is_clinic_admin(clinic_id));

drop policy if exists ai_usage_select on public.ai_usage;
create policy ai_usage_select on public.ai_usage for select to authenticated using (public.is_member(clinic_id));
drop policy if exists subscriptions_select on public.subscriptions;
create policy subscriptions_select on public.subscriptions for select to authenticated using (public.is_member(clinic_id));
drop policy if exists automation_requests_select on public.automation_requests;
create policy automation_requests_select on public.automation_requests for select to authenticated using (public.is_member(clinic_id));
drop policy if exists automation_requests_insert on public.automation_requests;
create policy automation_requests_insert on public.automation_requests for insert to authenticated with check (public.is_clinic_admin(clinic_id));
drop policy if exists api_keys_select on public.api_keys;
create policy api_keys_select on public.api_keys for select to authenticated using (public.is_clinic_admin(clinic_id));
drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log for select to authenticated using (public.is_clinic_admin(clinic_id));
-- billing_events: sem política = só o servidor (service role) acessa.

-- Criação de clínica pelo servidor (venda feita pelo comercial da Fluxa). Só o service_role executa.
create or replace function public.provision_clinic(p_owner uuid, p_name text, p_kind clinic_kind, p_phone text, p_city text, p_state text,
  p_plan text default 'sistema', p_trial_days int default 7, p_source text default 'fluxa_comercial')
returns uuid language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  select c.id into cid from clinics c where c.owner_id = p_owner and lower(c.name) = lower(trim(p_name)) limit 1;
  if cid is not null then return cid; end if;
  insert into clinics (name, kind, phone, whatsapp, city, state, owner_id, plan, trial_ends_at, source)
  values (trim(p_name), p_kind, p_phone, p_phone, p_city, p_state, p_owner, p_plan, now() + make_interval(days => greatest(p_trial_days, 0)), p_source)
  returning id into cid;
  insert into memberships (clinic_id, user_id, role) values (cid, p_owner, 'owner') on conflict do nothing;
  insert into subscriptions (clinic_id, provider, status) values (cid, 'pagarme', 'pending') on conflict do nothing;
  perform seed_clinic(cid, p_kind);
  return cid;
end $$;
revoke execute on function public.provision_clinic(uuid, text, clinic_kind, text, text, text, text, int, text) from public, anon, authenticated;
grant execute on function public.provision_clinic(uuid, text, clinic_kind, text, text, text, text, int, text) to service_role;
grant execute on function public.ai_usage_this_month(uuid, text) to service_role;

grant execute on function public.create_clinic(text, clinic_kind, text, text, text) to authenticated;
grant execute on function public.accept_invite(text) to authenticated;
revoke execute on function public.seed_clinic(uuid, clinic_kind) from public, anon, authenticated;
