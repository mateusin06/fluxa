-- =====================================================================
-- Fluxa SaaS — esquema principal (multi-clínica)
-- Postgres / Supabase. Rode na ordem: 0001, 0002, 0003.
-- Toda tabela de dados de clínica tem clinic_id e RLS por associação.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Tipos -------------------------------------------------------
do $$ begin
  create type clinic_kind as enum ('odonto', 'estetica');
exception when duplicate_object then null; end $$;
do $$ begin
  create type clinic_status as enum ('trial', 'active', 'past_due', 'blocked', 'canceled');
exception when duplicate_object then null; end $$;
do $$ begin
  create type member_role as enum ('owner', 'admin', 'staff');
exception when duplicate_object then null; end $$;
do $$ begin
  create type stage_kind as enum ('open', 'won', 'lost');
exception when duplicate_object then null; end $$;
do $$ begin
  create type appt_status as enum ('agendado', 'confirmado', 'realizado', 'faltou', 'cancelado');
exception when duplicate_object then null; end $$;
do $$ begin
  create type activity_type as enum ('nota', 'ligacao', 'whatsapp', 'email', 'tarefa', 'etapa', 'sistema');
exception when duplicate_object then null; end $$;

-- ---------- Perfis (1:1 com auth.users) ---------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  is_platform_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- Clínicas ------------------------------------------------------
create table if not exists public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  kind clinic_kind not null default 'odonto',
  phone text,
  whatsapp text,
  email text,
  document text,                -- CNPJ ou CPF
  city text,
  state text,
  address text,
  responsible_name text,        -- responsável técnico
  responsible_reg text,         -- CRO / registro profissional do responsável técnico
  instagram text,
  google_review_url text,
  logo_path text,
  brand jsonb not null default '{"primary":"#0F766E","secondary":"#F4F6FB","accent":"#B8F34A","dark":"#0A0F1C"}'::jsonb,
  plan text not null default 'sistema' check (plan in ('sistema', 'sistema_automacoes')),
  status clinic_status not null default 'trial',
  trial_ends_at timestamptz not null default (now() + interval '7 days'),
  past_due_since timestamptz,
  source text not null default 'self' check (source in ('self', 'fluxa_comercial', 'admin')),
  owner_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists clinics_status_idx on public.clinics(status);

create table if not exists public.memberships (
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role member_role not null default 'staff',
  created_at timestamptz not null default now(),
  primary key (clinic_id, user_id)
);
create index if not exists memberships_user_idx on public.memberships(user_id);

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  email text not null,
  role member_role not null default 'staff' check (role <> 'owner'),
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  invited_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists invites_clinic_idx on public.invites(clinic_id);

-- ---------- CRM -------------------------------------------------------------
create table if not exists public.stages (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null,
  position int not null default 0,
  kind stage_kind not null default 'open',
  color text not null default '#64748B',
  created_at timestamptz not null default now()
);
create index if not exists stages_clinic_idx on public.stages(clinic_id, position);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  phone text,                   -- só dígitos com DDI (5519...)
  email text,
  birth_date date,
  gender text,
  source text not null default 'manual', -- manual, anuncio, indicacao, instagram, google, whatsapp, api
  source_detail text,
  tags text[] not null default '{}',
  notes text,
  consent_whatsapp boolean not null default true,
  last_visit_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists contacts_clinic_idx on public.contacts(clinic_id, created_at desc);
create index if not exists contacts_phone_idx on public.contacts(clinic_id, phone);
create index if not exists contacts_name_idx on public.contacts using gin (to_tsvector('simple', name));

create table if not exists public.procedures (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null,
  category text,
  price numeric(12,2),
  duration_min int not null default 60 check (duration_min between 5 and 600),
  return_days int check (return_days between 1 and 1095),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists procedures_clinic_idx on public.procedures(clinic_id);

create table if not exists public.professionals (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null,
  specialty text,
  registration text,            -- CRO, CRM, COREN, CRBM...
  bio text,
  photo_path text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists professionals_clinic_idx on public.professionals(clinic_id);

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  stage_id uuid not null references public.stages(id) on delete restrict,
  procedure_id uuid references public.procedures(id) on delete set null,
  title text not null,
  value numeric(12,2) not null default 0,
  position double precision not null default 0,
  owner_id uuid references auth.users(id) on delete set null,
  expected_close date,
  lost_reason text,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists deals_clinic_stage_idx on public.deals(clinic_id, stage_id, position);
create index if not exists deals_contact_idx on public.deals(contact_id);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete cascade,
  type activity_type not null default 'nota',
  body text not null default '',
  due_at timestamptz,
  done_at timestamptz,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists activities_contact_idx on public.activities(contact_id, created_at desc);
create index if not exists activities_tasks_idx on public.activities(clinic_id, due_at) where type = 'tarefa' and done_at is null;

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  professional_id uuid references public.professionals(id) on delete set null,
  procedure_id uuid references public.procedures(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status appt_status not null default 'agendado',
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists appointments_clinic_time_idx on public.appointments(clinic_id, starts_at);
create index if not exists appointments_contact_idx on public.appointments(contact_id);

-- ---------- Marketing / IA -----------------------------------------------
create table if not exists public.creative_briefs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  title text not null,
  objective text not null,
  procedure_id uuid references public.procedures(id) on delete set null,
  professional_ids uuid[] not null default '{}',
  audience text,
  tone text,
  offer text,
  instructions text,
  formats text[] not null default '{feed}',
  photo_paths text[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists briefs_clinic_idx on public.creative_briefs(clinic_id, created_at desc);

create table if not exists public.creatives (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  brief_id uuid references public.creative_briefs(id) on delete cascade,
  format text not null check (format in ('feed', 'story', 'quadrado')),
  template text not null,
  content jsonb not null,       -- textos e escolhas visuais da arte
  ad_copy jsonb not null default '{}'::jsonb, -- texto principal, título, descrição, CTA
  compliance jsonb not null default '[]'::jsonb,
  image_path text,              -- PNG exportado
  bg_path text,                 -- fundo gerado por IA (opcional)
  status text not null default 'rascunho' check (status in ('rascunho', 'aprovado', 'arquivado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists creatives_clinic_idx on public.creatives(clinic_id, created_at desc);

create table if not exists public.copies (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  kind text not null,           -- anuncio, legenda, whatsapp, google, roteiro_video
  topic text not null,
  content jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists copies_clinic_idx on public.copies(clinic_id, created_at desc);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null,
  objective text not null,
  daily_budget numeric(10,2),
  plan jsonb not null,
  status text not null default 'planejada' check (status in ('planejada', 'ativa', 'pausada', 'encerrada')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists campaigns_clinic_idx on public.campaigns(clinic_id, created_at desc);

create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  kind text not null check (kind in ('text', 'image')),
  feature text not null,
  tokens_in int not null default 0,
  tokens_out int not null default 0,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_clinic_month_idx on public.ai_usage(clinic_id, kind, created_at);

-- ---------- Cobrança e automações ------------------------------------------
create table if not exists public.subscriptions (
  clinic_id uuid primary key references public.clinics(id) on delete cascade,
  provider text not null default 'pagarme' check (provider in ('pagarme', 'manual')),
  customer_id text,
  subscription_id text unique,
  payment_method text,
  amount_cents int not null default 19700,
  status text not null default 'pending',
  current_period_end timestamptz,
  last_event text,
  pending_payment_url text,       -- boleto/linha digitável em aberto
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_events (
  id bigint generated always as identity primary key,
  provider text not null,
  event_id text not null,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  error text,
  received_at timestamptz not null default now(),
  unique (provider, event_id)
);

create table if not exists public.automation_requests (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  flows text[] not null default '{}',
  status text not null default 'solicitado' check (status in ('solicitado', 'em_instalacao', 'ativo', 'cancelado')),
  setup_cents int not null default 79700,
  monthly_cents int not null default 39700,
  contact_name text,
  contact_phone text,
  notes text,
  requested_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists automation_requests_clinic_idx on public.automation_requests(clinic_id);

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null default 'n8n',
  prefix text not null,
  key_hash text not null unique,  -- sha256 da chave; a chave em si nunca é salva
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists api_keys_clinic_idx on public.api_keys(clinic_id);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  clinic_id uuid references public.clinics(id) on delete cascade,
  user_id uuid,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_clinic_idx on public.audit_log(clinic_id, created_at desc);

-- ---------- updated_at automático ------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['clinics','contacts','deals','appointments','creatives','automation_requests'] loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;
