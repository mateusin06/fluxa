-- =====================================================================
-- Fluxa SaaS — convênios e nota fiscal de serviço (NFS-e nacional)
-- Rode depois de 0001–0007. Pode ser rodado de novo sem erro.
-- =====================================================================

-- ---------- 1. Convênios ------------------------------------------------
-- A clínica diz se atende convênio e quais. Quem não atende continua 100% particular.
alter table public.clinics add column if not exists accepts_insurance boolean not null default false;
alter table public.clinics add column if not exists insurances text[] not null default '{}';

-- Convênio do paciente (vazio = particular)
alter table public.contacts add column if not exists insurance text;
alter table public.contacts add column if not exists insurance_card text;
alter table public.contacts add column if not exists insurance_plan text;
alter table public.contacts add column if not exists insurance_valid date;
alter table public.contacts drop constraint if exists contacts_insurance_chk;
alter table public.contacts add constraint contacts_insurance_chk check (
  (insurance is null or char_length(insurance) <= 80) and (insurance_card is null or char_length(insurance_card) <= 40)
  and (insurance_plan is null or char_length(insurance_plan) <= 80));

-- Quem paga a consulta: o paciente (particular) ou o convênio, com o número da guia/autorização
alter table public.appointments add column if not exists payer text not null default 'particular';
alter table public.appointments add column if not exists insurance text;
alter table public.appointments add column if not exists insurance_auth text;
alter table public.appointments drop constraint if exists appointments_payer_chk;
alter table public.appointments add constraint appointments_payer_chk check (
  payer in ('particular', 'convenio') and (payer = 'particular' or insurance is not null)
  and (insurance is null or char_length(insurance) <= 80) and (insurance_auth is null or char_length(insurance_auth) <= 40));

-- A cobrança de convênio é recebida da operadora: não entra na régua de cobrança do paciente
alter table public.charges add column if not exists payer text not null default 'paciente';
alter table public.charges add column if not exists insurance text;
alter table public.charges drop constraint if exists charges_payer_chk;
alter table public.charges add constraint charges_payer_chk check (payer in ('paciente', 'convenio') and (insurance is null or char_length(insurance) <= 80));
create index if not exists charges_payer_idx on public.charges(clinic_id, payer, status, due_date);
create index if not exists contacts_insurance_idx on public.contacts(clinic_id, insurance) where insurance is not null;

-- Consulta realizada vira cobrança: do paciente (vence hoje) ou do convênio (vence em 30 dias, prazo médio de repasse)
create or replace function public.appointment_charge() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ch record;
  existe boolean;
  descr text;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  conv boolean := new.payer = 'convenio' and new.insurance is not null;
  venc date := case when new.payer = 'convenio' then hoje + 30 else hoje end;
begin
  if new.status = 'realizado' and new.contact_id is not null and coalesce(new.price, 0) > 0 and new.quote_item_id is null then
    select id, status, amount, payer, insurance into ch from charges where appointment_id = new.id;
    existe := found;
    select coalesce((select name from procedures where id = new.procedure_id), new.procedure_text, 'Consulta') into descr;
    descr := descr || ' (' || to_char(new.starts_at at time zone 'America/Sao_Paulo', 'DD/MM') || ')'
             || case when conv then ' · ' || new.insurance || coalesce(' · guia ' || new.insurance_auth, '') else '' end;
    if not existe then
      insert into charges (clinic_id, contact_id, appointment_id, description, amount, due_date, status, payer, insurance)
      values (new.clinic_id, new.contact_id, new.id, descr, new.price, venc, 'aberto',
              case when conv then 'convenio' else 'paciente' end, case when conv then new.insurance end);
    elsif ch.status = 'cancelado' then
      update charges set status = 'aberto', amount = new.price, due_date = venc, paid_at = null, description = descr,
             payer = case when conv then 'convenio' else 'paciente' end, insurance = case when conv then new.insurance end
       where id = ch.id;
    elsif ch.status = 'aberto' and (ch.amount is distinct from new.price or ch.payer is distinct from (case when conv then 'convenio' else 'paciente' end)
                                    or ch.insurance is distinct from (case when conv then new.insurance end)) then
      update charges set amount = new.price, description = descr,
             due_date = case when ch.payer is distinct from (case when conv then 'convenio' else 'paciente' end) then venc else due_date end,
             payer = case when conv then 'convenio' else 'paciente' end, insurance = case when conv then new.insurance end
       where id = ch.id;
    end if;
  elsif tg_op = 'UPDATE' and (old.status = 'realizado' or new.status = 'realizado') then
    update charges set status = 'cancelado' where appointment_id = new.id and status = 'aberto';
  end if;
  return new;
end $$;
drop trigger if exists appointments_charge on public.appointments;
create trigger appointments_charge after insert or update of status, price, contact_id, payer, insurance, insurance_auth on public.appointments
  for each row execute function public.appointment_charge();

-- ---------- 2. Nota fiscal de serviço (NFS-e, padrão nacional) -----------
-- Configuração fiscal da clínica (prestador). O certificado A1 fica cifrado pelo servidor
-- e esta tabela não é lida pelo navegador (sem política de RLS: só o servidor acessa).
create table if not exists public.nfse_config (
  clinic_id uuid primary key references public.clinics(id) on delete cascade,
  ambiente text not null default '2' check (ambiente in ('1', '2')),          -- 1 produção, 2 produção restrita (teste)
  documento text check (documento is null or documento ~ '^(\d{11}|\d{14})$'),  -- CNPJ ou CPF, só números
  inscricao_municipal text check (inscricao_municipal is null or char_length(inscricao_municipal) <= 15),
  razao_social text check (razao_social is null or char_length(razao_social) <= 150),
  cod_municipio text check (cod_municipio is null or cod_municipio ~ '^\d{7}$'), -- código IBGE
  uf text check (uf is null or uf ~ '^[A-Z]{2}$'),
  cep text check (cep is null or cep ~ '^\d{8}$'),
  logradouro text, numero text, complemento text, bairro text, fone text, email text,
  op_simples text not null default '3' check (op_simples in ('1', '2', '3')),  -- 1 não optante, 2 MEI, 3 ME/EPP
  reg_ap_trib_sn text check (reg_ap_trib_sn is null or reg_ap_trib_sn in ('1', '2', '3')),
  reg_esp_trib text not null default '0' check (reg_esp_trib in ('0', '1', '2', '3', '4', '5', '6', '9')),
  p_tot_trib_sn numeric(5,2) check (p_tot_trib_sn is null or p_tot_trib_sn between 0 and 99.99),
  serie text not null default '1' check (serie ~ '^\d{1,5}$'),
  ultimo_ndps bigint not null default 0,
  c_trib_nac text check (c_trib_nac is null or c_trib_nac ~ '^\d{6}$'),
  c_trib_mun text check (c_trib_mun is null or c_trib_mun ~ '^\d{3}$'),
  c_nbs text check (c_nbs is null or c_nbs ~ '^\d{9}$'),
  descricao_padrao text check (descricao_padrao is null or char_length(descricao_padrao) <= 1000),
  trib_issqn text not null default '1' check (trib_issqn in ('1', '2', '3', '4')),
  tp_ret_issqn text not null default '1' check (tp_ret_issqn in ('1', '2', '3')),
  aliquota numeric(4,2) check (aliquota is null or aliquota between 0 and 9.99),
  cert_pfx_enc text,             -- certificado A1 (.pfx) + senha, cifrados (AES-256-GCM) pelo servidor
  cert_subject text,
  cert_valid_to timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.nfse_config enable row level security;
revoke all on public.nfse_config from anon, authenticated;
grant all on public.nfse_config to service_role;

-- Notas emitidas (o navegador só lê; quem grava é o servidor)
create table if not exists public.nfse (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  charge_id uuid references public.charges(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  ambiente text not null check (ambiente in ('1', '2')),
  serie text not null,
  n_dps bigint not null,
  dps_id text,
  status text not null default 'processando' check (status in ('processando', 'autorizada', 'rejeitada', 'erro', 'cancelada')),
  competencia date not null,
  valor numeric(12,2) not null check (valor > 0),
  desconto numeric(12,2) not null default 0 check (desconto >= 0),
  descricao text not null check (char_length(descricao) between 1 and 2000),
  tomador jsonb not null default '{}'::jsonb,
  servico jsonb not null default '{}'::jsonb,
  chave_acesso text,
  numero text,
  xml_dps text,
  xml_nfse text,
  resposta jsonb,
  erros jsonb,
  cancel_motivo text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, ambiente, serie, n_dps)
);
create index if not exists nfse_clinic_idx on public.nfse(clinic_id, created_at desc);
create index if not exists nfse_charge_idx on public.nfse(charge_id) where charge_id is not null;
alter table public.nfse enable row level security;
drop policy if exists nfse_select on public.nfse;
create policy nfse_select on public.nfse for select to authenticated using (public.is_clinic_admin(clinic_id));
revoke all on public.nfse from anon, authenticated;
grant select on public.nfse to authenticated;
grant all on public.nfse to service_role;

-- Próximo número de DPS da clínica (atômico; usado só pelo servidor)
create or replace function public.next_dps_number(cid uuid) returns bigint
language sql security definer set search_path = public as $$
  update nfse_config set ultimo_ndps = ultimo_ndps + 1 where clinic_id = cid returning ultimo_ndps;
$$;
revoke execute on function public.next_dps_number(uuid) from public, anon, authenticated;
grant execute on function public.next_dps_number(uuid) to service_role;
