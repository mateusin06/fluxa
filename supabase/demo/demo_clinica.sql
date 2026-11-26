-- =====================================================================
-- Fluxa — CLÍNICA DE DEMONSTRAÇÃO ("Clínica Aurora")
-- Cola tudo no SQL Editor do Supabase e clica em Run.
--
-- O que faz:
--  1) cria (ou reaproveita) 2 logins de demonstração;
--  2) APAGA a clínica de demonstração anterior (só ela) e recria tudo do zero,
--     com datas relativas a HOJE: agenda cheia, CRM, financeiro, orçamentos,
--     despesas, comissões, ficha clínica, textos e campanhas com IA.
--
-- Pode rodar de novo quando quiser (ex.: toda segunda) para "renovar" as datas
-- ou para desfazer a bagunça de um teste. Não mexe em nenhuma outra clínica.
-- Pré-requisito: migrações 0001 a 0007 já rodadas.
--
-- Logins (mesma senha nos dois):
--   dono:     demo@fluxa.demo        Demo@Fluxa2026   (vê tudo: financeiro, ficha clínica, equipe)
--   recepção: recepcao@fluxa.demo    Demo@Fluxa2026   (sem financeiro e sem ficha clínica)
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1) LOGINS
-- ---------------------------------------------------------------------
do $$
declare
  u record;
  uid uuid;
begin
  for u in select * from (values
    ('demo@fluxa.demo',     'Dra. Helena Duarte'),
    ('recepcao@fluxa.demo', 'Bianca Moraes (recepção)')
  ) as t(email, nome) loop
    select id into uid from auth.users where email = u.email;
    if uid is null then
      uid := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change
      ) values (
        '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', u.email,
        crypt('Demo@Fluxa2026', gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('full_name', u.nome),
        now(), now(), '', '', '', ''
      );
      insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), uid, uid::text, 'email',
              jsonb_build_object('sub', uid::text, 'email', u.email, 'email_verified', true), now(), now(), now());
    else
      update auth.users
         set encrypted_password = crypt('Demo@Fluxa2026', gen_salt('bf')),
             email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now()
       where id = uid;
    end if;
    insert into public.profiles (id, full_name) values (uid, u.nome)
    on conflict (id) do update set full_name = excluded.full_name;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2) CLÍNICA E DADOS
-- ---------------------------------------------------------------------
-- ids fixos e válidos (UUID versão 4): o mesmo nome gera sempre o mesmo id
create or replace function pg_temp.k(t text) returns uuid language sql immutable as $$
  select (substr(h, 1, 12) || '4' || substr(h, 14, 3) || substr('89ab', (('x' || substr(h, 17, 1))::bit(4)::int % 4) + 1, 1) || substr(h, 18, 15))::uuid
  from (select md5('aurora:' || t) as h) x
$$;
create or replace function pg_temp.wd(d date) returns date language sql immutable as $$ select case extract(dow from d)::int when 0 then d + 1 when 6 then d + 2 else d end $$;

do $demo$
declare
  cid   constant uuid := 'a0a0a0a0-0000-4000-8000-00000000a001';
  own   uuid := (select id from auth.users where email = 'demo@fluxa.demo');
  stf   uuid := (select id from auth.users where email = 'recepcao@fluxa.demo');
  nowt  timestamptz := now();
  hoje  date := (now() at time zone 'America/Sao_Paulo')::date;
  mes0  date := date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
  ini   date;                       -- primeiro dia do mês de 2 meses atrás
  firsts text[] := array['Ana','Beatriz','Carlos','Daniela','Eduardo','Fernanda','Gabriel','Isabela','João','Karina','Lucas','Mariana','Nicolas','Olívia','Paulo','Sandra','Thiago','Vanessa','Alexandre','Cláudia','Diego','Elaine','Felipe','Gustavo','Heloísa','Igor','Letícia','Marcelo','Natália','Otávio','Patrícia','Renato','Silvana','Tatiane','Vinícius','Wagner','Yasmin','Rodrigo','Aline','André'];
  fem    text[] := array['Ana','Beatriz','Daniela','Fernanda','Isabela','Karina','Mariana','Olívia','Sandra','Vanessa','Cláudia','Elaine','Heloísa','Letícia','Natália','Patrícia','Silvana','Tatiane','Yasmin','Aline'];
  surs   text[] := array['Silva','Santos','Oliveira','Souza','Pereira','Lima','Carvalho','Ferreira','Rodrigues','Almeida','Costa','Gomes','Martins','Araújo','Ribeiro','Barbosa','Cardoso','Rocha','Dias','Nascimento','Moreira','Cavalcanti','Teixeira','Monteiro','Correia','Batista','Freitas','Machado','Pinto','Azevedo'];
  srcs   text[] := array['anuncio','anuncio','anuncio','indicacao','indicacao','instagram','google','google','whatsapp','manual'];
  tagsl  text[] := array['ortodontia','implante','estética','retorno','vip','prevenção'];
  -- procedimentos: nome, categoria, preço, duração, retorno
  pnm text[] := array['Avaliação odontológica','Limpeza (profilaxia)','Restauração em resina','Clareamento a laser','Tratamento de canal','Implante unitário','Manutenção ortodôntica','Alinhadores transparentes','Lentes de porcelana (por dente)','Extração de siso','Toxina botulínica (harmonização)','Preenchimento labial'];
  pcat text[] := array['Clínico geral','Prevenção','Dentística','Estética','Endodontia','Implantodontia','Ortodontia','Ortodontia','Estética','Cirurgia','Harmonização','Harmonização'];
  ppr numeric[] := array[120,220,280,1200,950,3800,250,7800,1800,450,1400,1600];
  pdur int[] := array[30,45,60,60,90,120,30,60,120,60,45,60];
  pret int[] := array[null,180,null,365,30,90,30,30,180,null,120,180];
  -- profissionais
  prn text[] := array['Dra. Helena Duarte','Dr. Rafael Menezes','Dra. Camila Torres','Dr. Bruno Albuquerque','Dra. Juliana Prado'];
  prs text[] := array['Ortodontia','Implantodontia e Cirurgia','Estética e Harmonização orofacial','Clínico geral','Endodontia'];
  prg text[] := array['CRO-SP 71.482','CRO-SP 64.920','CRO-SP 88.115','CRO-SP 102.377','CRO-SP 93.508'];
  prc numeric[] := array[30,32,32,25,30];
  pro_days jsonb := '[[1,2,3,4,5],[2,4,6],[1,3,5,6],[1,2,3,4,5],[2,3,4]]'::jsonb;
  pools jsonb := '[[7,7,7,7,7,7,7,1,1],[10,10,10,1,1,3,3,6,10],[11,11,11,12,4,4,9,1,1],[2,2,2,2,3,3,3,1,1,4],[5,5,5,3,3,1,5,3]]'::jsonb;
  i int; p int; d int; blk int; n int;
  dd date; dow int; t time; bs time; be time; h int; pct int; proc int; dur int; npool int;
  s timestamptz; e timestamptz; pat int; st text; apid uuid; pcount int;
  fn text; sn text; nm text; sx text; created timestamptz; bd date;
  n_contacts constant int := 110;
  n_pool constant int := 79;        -- pacientes com histórico; 80..110 são leads recentes
  v numeric; m int; mm date; me date; rec record;
  bodies text[] := array[
    'Avaliação clínica completa e planejamento do tratamento. Paciente orientado, sem queixas agudas.',
    'Profilaxia e remoção de cálculo. Orientação de higiene e uso de fio dental. Retorno em 6 meses.',
    'Restauração em resina composta, isolamento relativo, ajuste oclusal sem intercorrências.',
    'Clareamento em consultório, 3 aplicações de 15 min. Sensibilidade leve relatada, orientado uso de dessensibilizante.',
    'Instrumentação e obturação do canal. Radiografia final satisfatória. Retorno para controle em 30 dias.',
    'Cirurgia de implante realizada sem intercorrências. Orientações pós-operatórias entregues.',
    'Manutenção do aparelho: troca de elásticos e ajuste do arco. Boa higiene. Próxima manutenção em 30 dias.',
    'Moldagem digital realizada, plano de alinhadores aprovado.',
    'Preparo e cimentação das lentes. Paciente satisfeito com cor e forma.',
    'Exodontia do 38 sem intercorrências. Sutura e orientações. Retorno em 7 dias para remover pontos.',
    'Aplicação de toxina botulínica em terço superior. Orientações pós-procedimento entregues. Retorno em 15 dias para revisão.',
    'Preenchimento labial com ácido hialurônico. Sem intercorrências. Orientado a evitar calor e exercício por 24 h.'
  ];
begin
  if own is null or stf is null then
    raise exception 'Os logins de demonstração não foram criados. Rode o script inteiro, a partir da primeira linha.';
  end if;
  ini := (mes0 - interval '2 months')::date;

  -- apaga a demonstração anterior (cascata leva tudo que tem clinic_id)
  delete from public.deals where clinic_id = cid;
  delete from public.clinics where id = cid;

  -- ===== clínica =====
  insert into clinics (id, name, kind, phone, whatsapp, email, document, city, state, address, responsible_name, responsible_reg,
                       instagram, google_review_url, plan, status, trial_ends_at, source, owner_id, slot_minutes, slot_capacity, slot_days_ahead)
  values (cid, 'Clínica Aurora (demonstração)', 'odonto', '5511900000000', '5511900000000', 'contato@clinicaaurora.demo', '12.345.678/0001-90',
          'São Paulo', 'SP', 'Av. das Acácias, 1200, sala 42 - Jardim Paulista', 'Dra. Helena Duarte', 'CRO-SP 71.482',
          '@clinicaaurora.demo', 'https://g.page/r/clinica-aurora-demo/review', 'sistema_automacoes', 'trial', now() + interval '10 years', 'admin', own, 30, 5, 28);
  insert into memberships (clinic_id, user_id, role, clinical_access) values (cid, own, 'owner', true), (cid, stf, 'staff', false);
  insert into subscriptions (clinic_id, provider, status, amount_cents) values (cid, 'manual', 'pending', 59400);

  -- ===== funil =====
  insert into stages (id, clinic_id, name, position, kind, color) values
    (pg_temp.k('st0'), cid, 'Novo lead', 0, 'open', '#64748B'),
    (pg_temp.k('st1'), cid, 'Em conversa', 1, 'open', '#0EA5E9'),
    (pg_temp.k('st2'), cid, 'Avaliação agendada', 2, 'open', '#F59E0B'),
    (pg_temp.k('st3'), cid, 'Orçamento enviado', 3, 'open', '#8B5CF6'),
    (pg_temp.k('st4'), cid, 'Fechado', 4, 'won', '#16A34A'),
    (pg_temp.k('st5'), cid, 'Perdido', 5, 'lost', '#DC2626');

  -- ===== procedimentos e profissionais =====
  for i in 1..12 loop
    insert into procedures (id, clinic_id, name, category, price, duration_min, return_days)
    values (pg_temp.k('proc' || i), cid, pnm[i], pcat[i], ppr[i], pdur[i], pret[i]);
  end loop;
  update clinics set slot_procedure_id = pg_temp.k('proc1') where id = cid;

  for i in 1..5 loop
    insert into professionals (id, clinic_id, name, specialty, registration, bio, attends, commission_pct)
    values (pg_temp.k('pro' || i), cid, prn[i], prs[i], prg[i],
            'Atua na ' || 'Clínica Aurora com foco em ' || lower(prs[i]) || '.', true, prc[i]);
  end loop;
  -- o que cada profissional faz (e comissão específica de alguns procedimentos)
  insert into professional_procedures (clinic_id, professional_id, procedure_id, commission_pct) values
    (cid, pg_temp.k('pro1'), pg_temp.k('proc1'), null), (cid, pg_temp.k('pro1'), pg_temp.k('proc7'), null), (cid, pg_temp.k('pro1'), pg_temp.k('proc8'), 20),
    (cid, pg_temp.k('pro2'), pg_temp.k('proc1'), null), (cid, pg_temp.k('pro2'), pg_temp.k('proc3'), null), (cid, pg_temp.k('pro2'), pg_temp.k('proc6'), 38), (cid, pg_temp.k('pro2'), pg_temp.k('proc10'), null),
    (cid, pg_temp.k('pro3'), pg_temp.k('proc1'), null), (cid, pg_temp.k('pro3'), pg_temp.k('proc4'), null), (cid, pg_temp.k('pro3'), pg_temp.k('proc9'), null), (cid, pg_temp.k('pro3'), pg_temp.k('proc11'), 36), (cid, pg_temp.k('pro3'), pg_temp.k('proc12'), 36),
    (cid, pg_temp.k('pro4'), pg_temp.k('proc1'), null), (cid, pg_temp.k('pro4'), pg_temp.k('proc2'), null), (cid, pg_temp.k('pro4'), pg_temp.k('proc3'), null), (cid, pg_temp.k('pro4'), pg_temp.k('proc4'), null),
    (cid, pg_temp.k('pro5'), pg_temp.k('proc1'), null), (cid, pg_temp.k('pro5'), pg_temp.k('proc3'), null), (cid, pg_temp.k('pro5'), pg_temp.k('proc5'), 32);

  -- ===== horário de atendimento =====
  for d in 1..5 loop
    insert into business_hours (clinic_id, weekday, start_time, end_time) values (cid, d, '08:00', '12:00'), (cid, d, '13:30', '18:00');
  end loop;
  insert into business_hours (clinic_id, weekday, start_time, end_time) values (cid, 6, '08:00', '12:00');
  -- horários próprios: Rafael (ter, qui, sáb de manhã), Camila (seg, qua, sex, sáb de manhã), Juliana (ter a qui, horário reduzido)
  for d in select unnest(array[2,4]) loop
    insert into business_hours (clinic_id, professional_id, weekday, start_time, end_time) values (cid, pg_temp.k('pro2'), d, '08:00', '12:00'), (cid, pg_temp.k('pro2'), d, '13:30', '18:00');
  end loop;
  insert into business_hours (clinic_id, professional_id, weekday, start_time, end_time) values (cid, pg_temp.k('pro2'), 6, '08:00', '12:00');
  for d in select unnest(array[1,3,5]) loop
    insert into business_hours (clinic_id, professional_id, weekday, start_time, end_time) values (cid, pg_temp.k('pro3'), d, '08:00', '12:00'), (cid, pg_temp.k('pro3'), d, '13:30', '18:00');
  end loop;
  insert into business_hours (clinic_id, professional_id, weekday, start_time, end_time) values (cid, pg_temp.k('pro3'), 6, '08:00', '12:00');
  for d in select unnest(array[2,3,4]) loop
    insert into business_hours (clinic_id, professional_id, weekday, start_time, end_time) values (cid, pg_temp.k('pro5'), d, '09:00', '12:00'), (cid, pg_temp.k('pro5'), d, '13:30', '17:00');
  end loop;

  -- ===== pacientes e leads =====
  for i in 1..n_contacts loop
    fn := firsts[(i * 7) % 40 + 1];
    sn := surs[(i * 11) % 30 + 1] || case when i % 3 = 0 then ' ' || surs[(i * 13 + 5) % 30 + 1] else '' end;
    nm := fn || ' ' || sn;
    sx := case when fn = any(fem) then 'feminino' else 'masculino' end;
    if i <= n_pool then
      created := nowt - ((abs(hashtext('cr' || i)) % 300 + 20) || ' days')::interval;
    else
      created := nowt - ((abs(hashtext('cr' || i)) % 24) || ' days')::interval - ((abs(hashtext('crh' || i)) % 20) || ' hours')::interval;
    end if;
    -- 8 aniversariantes neste mês
    bd := case when i <= 8 then make_date(1960 + (i * 5) % 40, extract(month from hoje)::int, greatest(1, least(28, extract(day from hoje)::int + i - 2)))
               else make_date(1960 + (i * 7) % 45, 1 + (i * 5) % 12, 1 + (i * 3) % 28) end;
    insert into contacts (id, clinic_id, name, phone, email, birth_date, gender, source, source_detail, tags, consent_whatsapp, notes, document, meta, created_by, created_at)
    values (pg_temp.k('c' || i), cid, nm, '55119000' || lpad(i::text, 5, '0'),
            case when i % 2 = 0 then lower(translate(fn || '.' || split_part(sn, ' ', 1), 'ãáâàéêíóôõúçÃÁÂÉÍÓÕÚÇ', 'aaaaeeiooucAAAEIOOUC')) || '@email.demo' else null end,
            bd, sx,
            case when i > n_pool then (array['anuncio','anuncio','anuncio','instagram','whatsapp','google'])[i % 6 + 1] else srcs[i % 10 + 1] end,
            case when i > n_pool then 'Anúncio: ' || (array['Clareamento a laser','Lentes de porcelana','Implante dentário','Alinhadores','Harmonização orofacial'])[i % 5 + 1] end,
            case when i <= n_pool then array[tagsl[i % 6 + 1]] || case when i % 9 = 0 then array['vip'] else '{}'::text[] end else array['lead'] end,
            not (i in (17, 41, 66)),
            case when i = 2 then 'Prefere atendimento no período da manhã.' when i = 6 then 'Ansiosa em procedimentos longos; combinar pausas.' when i = 11 then 'Indicação da paciente da cadeira 2. Quer clarear antes do casamento.' end,
            case when i in (5, 9, 14, 21) then lpad((10000000000 + i * 7919)::text, 11, '0') end,
            case when i > n_pool then '{"lead":"sim"}'::jsonb else '{}'::jsonb end,
            own, created);
  end loop;

  -- ===== AGENDA: geração dia a dia, por profissional =====
  for d in (ini - hoje)..28 loop
    dd := hoje + d;
    dow := extract(dow from dd)::int;
    continue when dow = 0;
    for p in 1..5 loop
      continue when not (pro_days -> (p - 1)) @> to_jsonb(dow);
      -- chance de ocupar cada intervalo livre: alta nos próximos dias, cai com a distância
      pct := case when d < 0 then 34 + abs(hashtext('w' || d)) % 8
                  when d = 0 then 40
                  else greatest(14, 44 - d) end;
      for blk in 1..2 loop
        if blk = 1 then bs := case when p = 5 then '09:00'::time else '08:00'::time end; be := '12:00'::time;
        else
          continue when dow = 6;
          bs := '13:30'::time; be := case when p = 5 then '17:00'::time else '18:00'::time end;
        end if;
        t := bs;
        while t < be loop
          h := abs(hashtext(p || '|' || dd || '|' || t));
          if h % 100 < pct then
            npool := jsonb_array_length(pools -> (p - 1));
            proc := (pools -> (p - 1) ->> ((h / 100) % npool))::int;
            dur := pdur[proc];
            if t + (dur || ' minutes')::interval <= be then
              s := (dd + t) at time zone 'America/Sao_Paulo';
              e := s + (dur || ' minutes')::interval;
              pat := 1 + (h / 7) % n_pool;
              if not exists (select 1 from appointments a where a.contact_id = pg_temp.k('c' || pat) and a.starts_at < e and a.ends_at > s) then
                if e <= nowt then
                  st := case when (h / 11) % 100 < 82 then 'realizado' when (h / 11) % 100 < 91 then 'faltou' else 'cancelado' end;
                elsif s <= nowt then st := 'agendado';
                else
                  st := case when d <= 2 and (h / 11) % 100 < 70 then 'confirmado'
                             when (h / 11) % 100 < 8 then 'confirmado'
                             when (h / 11) % 100 > 97 then 'cancelado'
                             when (h / 11) % 100 > 94 then 'remarcar'
                             else 'agendado' end;
                end if;
                insert into appointments (id, clinic_id, contact_id, professional_id, procedure_id, starts_at, ends_at, status, notes, price, created_by, created_at)
                values (pg_temp.k('ap' || p || dd || t), cid, pg_temp.k('c' || pat), pg_temp.k('pro' || p), pg_temp.k('proc' || proc), s, e, st::appt_status,
                        case when (h / 13) % 17 = 0 then (array['Paciente pediu horário no fim do dia na próxima.','Trazer exames anteriores.','Chegar 10 min antes para preencher a ficha.','Confirmou por telefone.'])[1 + (h / 17) % 4] end,
                        ppr[proc], own, least(nowt, s - ((2 + h % 9) || ' days')::interval));
              end if;
              t := t + ((dur + ((h / 5) % 2) * 15) || ' minutes')::interval;
              continue;
            end if;
          end if;
          t := t + interval '30 minutes';
        end loop;
      end loop;
    end loop;
  end loop;

  -- leads com avaliação marcada (etapa "Avaliação agendada"): 6 horários nos próximos dias, em horários livres da Dra. Helena/Dr. Bruno
  dd := hoje;
  for i in 0..5 loop
    if i % 2 = 0 then
      loop dd := dd + 1; exit when extract(dow from dd) between 1 and 5; end loop;
    end if;
    s := (dd + (case when i % 2 = 0 then time '08:00' else time '16:30' end)) at time zone 'America/Sao_Paulo';
    delete from appointments a where a.clinic_id = cid and a.professional_id = pg_temp.k('pro' || (case when i % 2 = 0 then 4 else 1 end))
      and a.starts_at < s + interval '30 minutes' and a.ends_at > s;
    insert into appointments (id, clinic_id, contact_id, professional_id, procedure_id, starts_at, ends_at, status, price, created_by)
    values (pg_temp.k('apl' || i), cid, pg_temp.k('c' || (96 + i)), pg_temp.k('pro' || (case when i % 2 = 0 then 4 else 1 end)), pg_temp.k('proc1'), s, s + interval '30 minutes',
            (case when i < 2 then 'confirmado' else 'agendado' end)::appt_status, 120, own);
  end loop;

  -- ===== CRM: oportunidades =====
  -- leads: 80..88 Novo lead, 89..95 Em conversa, 96..101 Avaliação agendada
  for i in 80..110 loop
    declare
      stg int := case when i <= 88 then 0 when i <= 95 then 1 when i <= 101 then 2 else null end;
      pr_i int := 1 + (i * 3) % 12;
    begin
      continue when stg is null;
      insert into deals (id, clinic_id, contact_id, stage_id, procedure_id, title, value, position, owner_id, created_at)
      values (pg_temp.k('dl' || i), cid, pg_temp.k('c' || i), pg_temp.k('st' || stg),
              pg_temp.k('proc' || (array[4,9,6,8,11,4,5,12])[1 + i % 8]),
              (select name from procedures where id = pg_temp.k('proc' || (array[4,9,6,8,11,4,5,12])[1 + i % 8])),
              (select price from procedures where id = pg_temp.k('proc' || (array[4,9,6,8,11,4,5,12])[1 + i % 8])),
              i, own, (select created_at from contacts where id = pg_temp.k('c' || i)));
    end;
  end loop;
  -- lead que chegou há pouco, sem oportunidade ainda: 102..110 (aparecem só em Pacientes e leads)

  -- ===== ORÇAMENTOS =====
  -- número, contato, profissional, status, desconto, observação, validade (dias a partir de hoje), enviado há N dias, aprovado há N dias
  -- (a numeração 1,2,3... sai do gatilho, na ordem de inserção)
  insert into quotes (id, clinic_id, contact_id, professional_id, status, discount, notes, valid_until, sent_at, approved_at, refused_reason, payment, created_by, created_at) values
    (pg_temp.k('q1'),  cid, pg_temp.k('c5'),  pg_temp.k('pro2'), 'aprovado', 300,  'Implante com carga tardia. Inclui retorno de controle.', hoje - 14, nowt - interval '23 days', nowt - interval '21 days', null,
       jsonb_build_object('forma','credito','parcelas',10,'entrada_paga',false), own, nowt - interval '24 days'),
    (pg_temp.k('q2'),  cid, pg_temp.k('c9'),  pg_temp.k('pro1'), 'aprovado', 0,    'Tratamento de 12 meses com manutenção mensal.', hoje - 30, nowt - interval '70 days', nowt - interval '68 days', null,
       jsonb_build_object('forma','boleto','parcelas',12,'entrada_paga',true), own, nowt - interval '71 days'),
    (pg_temp.k('q3'),  cid, pg_temp.k('c14'), pg_temp.k('pro3'), 'aprovado', 800,  'Desenho do sorriso aprovado em mock-up.', hoje - 5, nowt - interval '12 days', nowt - interval '10 days', null,
       jsonb_build_object('forma','pix','parcelas',2,'entrada_paga',true), own, nowt - interval '13 days'),
    (pg_temp.k('q4'),  cid, pg_temp.k('c21'), pg_temp.k('pro4'), 'aprovado', 120,  null, hoje + 2, nowt - interval '6 days', nowt - interval '4 days', null,
       jsonb_build_object('forma','credito','parcelas',3,'entrada_paga',false), own, nowt - interval '7 days'),
    (pg_temp.k('q5'),  cid, pg_temp.k('c30'), pg_temp.k('pro2'), 'enviado', 400,   'Dois implantes e enxerto ósseo. Pode parcelar no cartão.', hoje + 7, nowt - interval '3 days', null, null, '{}'::jsonb, own, nowt - interval '4 days'),
    (pg_temp.k('q6'),  cid, pg_temp.k('c37'), pg_temp.k('pro1'), 'enviado', 500,   'Alinhadores com 18 meses de acompanhamento.', hoje + 10, nowt - interval '1 day', null, null, '{}'::jsonb, own, nowt - interval '2 days'),
    (pg_temp.k('q7'),  cid, pg_temp.k('c44'), pg_temp.k('pro3'), 'enviado', 0,     'Harmonização do terço superior e lábios.', hoje + 2, nowt - interval '5 days', null, null, '{}'::jsonb, own, nowt - interval '6 days'),
    (pg_temp.k('q8'),  cid, pg_temp.k('c51'), pg_temp.k('pro5'), 'rascunho', 0,    null, hoje + 15, null, null, null, '{}'::jsonb, own, nowt - interval '1 day'),
    (pg_temp.k('q9'),  cid, pg_temp.k('c58'), pg_temp.k('pro4'), 'recusado', 0,    null, hoje - 20, nowt - interval '32 days', null, 'Achou o valor alto e vai pesquisar em outra clínica.', '{}'::jsonb, own, nowt - interval '33 days'),
    (pg_temp.k('q10'), cid, pg_temp.k('c63'), pg_temp.k('pro2'), 'enviado', 0,     'Quatro sisos em duas sessões.', hoje + 5, nowt - interval '2 days', null, null, '{}'::jsonb, own, nowt - interval '2 days');
  insert into quote_items (id, clinic_id, quote_id, procedure_id, description, region, qty, unit_price, position) values
    (pg_temp.k('qi1a'), cid, pg_temp.k('q1'), pg_temp.k('proc6'), 'Implante unitário', 'Dente 36', 1, 3800, 0),
    (pg_temp.k('qi2a'), cid, pg_temp.k('q2'), pg_temp.k('proc8'), 'Alinhadores transparentes', 'Arcada superior e inferior', 1, 7800, 0),
    (pg_temp.k('qi2b'), cid, pg_temp.k('q2'), pg_temp.k('proc7'), 'Manutenção ortodôntica (mensal)', null, 12, 0, 1),
    (pg_temp.k('qi3a'), cid, pg_temp.k('q3'), pg_temp.k('proc9'), 'Lentes de porcelana', 'Dentes 13 ao 23', 6, 1800, 0),
    (pg_temp.k('qi4a'), cid, pg_temp.k('q4'), pg_temp.k('proc4'), 'Clareamento a laser', null, 1, 1200, 0),
    (pg_temp.k('qi4b'), cid, pg_temp.k('q4'), pg_temp.k('proc2'), 'Limpeza (profilaxia)', null, 1, 220, 1),
    (pg_temp.k('qi5a'), cid, pg_temp.k('q5'), pg_temp.k('proc6'), 'Implante unitário', 'Dentes 46 e 47', 2, 3800, 0),
    (pg_temp.k('qi5b'), cid, pg_temp.k('q5'), null, 'Enxerto ósseo', 'Região do 46', 1, 1800, 1),
    (pg_temp.k('qi6a'), cid, pg_temp.k('q6'), pg_temp.k('proc8'), 'Alinhadores transparentes', 'Arcada superior e inferior', 1, 7800, 0),
    (pg_temp.k('qi7a'), cid, pg_temp.k('q7'), pg_temp.k('proc11'), 'Toxina botulínica', 'Terço superior', 1, 1400, 0),
    (pg_temp.k('qi7b'), cid, pg_temp.k('q7'), pg_temp.k('proc12'), 'Preenchimento labial', null, 1, 1600, 1),
    (pg_temp.k('qi8a'), cid, pg_temp.k('q8'), pg_temp.k('proc5'), 'Tratamento de canal', 'Dente 16', 1, 950, 0),
    (pg_temp.k('qi8b'), cid, pg_temp.k('q8'), pg_temp.k('proc5'), 'Tratamento de canal', 'Dente 26', 1, 950, 1),
    (pg_temp.k('qi9a'), cid, pg_temp.k('q9'), pg_temp.k('proc4'), 'Clareamento a laser', null, 1, 1200, 0),
    (pg_temp.k('qi9b'), cid, pg_temp.k('q9'), pg_temp.k('proc9'), 'Lentes de porcelana', 'Dentes 11 e 21', 2, 1800, 1),
    (pg_temp.k('qi10a'), cid, pg_temp.k('q10'), pg_temp.k('proc10'), 'Extração de siso', 'Dentes 18, 28, 38 e 48', 4, 450, 0);

  -- oportunidades ligadas aos orçamentos
  insert into deals (id, clinic_id, contact_id, stage_id, procedure_id, title, value, position, owner_id, closed_at, created_at, lost_reason)
  select pg_temp.k('dq' || x.n), cid, q.contact_id, pg_temp.k('st' || x.stg), x.proc, x.title, quote_total(q.id), 100 + x.n, own,
         case when x.stg in (4, 5) then coalesce(q.approved_at, nowt - interval '30 days') end, q.created_at - interval '3 days',
         case when x.stg = 5 then q.refused_reason end
    from (values (1, 'q1', 4, pg_temp.k('proc6'), 'Implante 36'), (2, 'q2', 4, pg_temp.k('proc8'), 'Alinhadores'),
                 (3, 'q3', 4, pg_temp.k('proc9'), 'Lentes de porcelana'), (4, 'q4', 4, pg_temp.k('proc4'), 'Clareamento + limpeza'),
                 (5, 'q5', 3, pg_temp.k('proc6'), 'Dois implantes + enxerto'), (6, 'q6', 3, pg_temp.k('proc8'), 'Alinhadores'),
                 (7, 'q7', 3, pg_temp.k('proc11'), 'Harmonização'), (8, 'q8', 3, pg_temp.k('proc5'), 'Canais 16 e 26'),
                 (9, 'q9', 5, pg_temp.k('proc4'), 'Clareamento + lentes'), (10, 'q10', 3, pg_temp.k('proc10'), 'Quatro sisos'))
         as x(n, qk, stg, proc, title)
    join quotes q on q.id = pg_temp.k(x.qk);
  for i in 1..10 loop
    update quotes set deal_id = pg_temp.k('dq' || i) where id = pg_temp.k('q' || i) and clinic_id = cid;
  end loop;
  -- mais algumas ganhas e perdidas no CRM, para o funil parecer vivo
  insert into deals (id, clinic_id, contact_id, stage_id, procedure_id, title, value, position, owner_id, closed_at, created_at, lost_reason)
  select pg_temp.k('dx' || x.n), cid, pg_temp.k('c' || x.c), pg_temp.k('st' || x.stg), pg_temp.k('proc' || x.pr), x.title, x.val, 200 + x.n, own,
         nowt - (x.ago || ' days')::interval, nowt - ((x.ago + 12) || ' days')::interval, x.why
    from (values
      (1, 12, 4, 4, 'Clareamento a laser', 1200, 3, null::text), (2, 27, 4, 9, 'Lente de porcelana (1 dente)', 1800, 6, null),
      (3, 33, 4, 11, 'Toxina botulínica', 1400, 8, null), (4, 47, 4, 3, 'Restaurações (3 dentes)', 840, 12, null),
      (5, 55, 5, 6, 'Implante 25', 3800, 15, 'Fechou em outra clínica por preço menor.'), (6, 61, 5, 8, 'Alinhadores', 7800, 20, 'Vai adiar o tratamento para o ano que vem.'),
      (7, 70, 5, 4, 'Clareamento a laser', 1200, 9, 'Sem resposta depois do orçamento.'))
      as x(n, c, stg, pr, title, val, ago, why);

  -- sessões dos planos (já cobradas pelo orçamento: não geram cobrança de novo)
  -- plano de alinhadores (q2): manutenção mensal — 2 feitas, 1 marcada
  insert into appointments (id, clinic_id, contact_id, professional_id, procedure_id, quote_item_id, starts_at, ends_at, status, price, created_by, created_at) values
    (pg_temp.k('sess2a'), cid, pg_temp.k('c9'), pg_temp.k('pro1'), pg_temp.k('proc7'), pg_temp.k('qi2b'), (pg_temp.wd(hoje - 59) + time '09:00') at time zone 'America/Sao_Paulo', (pg_temp.wd(hoje - 59) + time '09:30') at time zone 'America/Sao_Paulo', 'realizado', null, own, nowt - interval '70 days'),
    (pg_temp.k('sess2b'), cid, pg_temp.k('c9'), pg_temp.k('pro1'), pg_temp.k('proc7'), pg_temp.k('qi2b'), (pg_temp.wd(hoje - 28) + time '09:00') at time zone 'America/Sao_Paulo', (pg_temp.wd(hoje - 28) + time '09:30') at time zone 'America/Sao_Paulo', 'realizado', null, own, nowt - interval '40 days'),
    (pg_temp.k('sess2c'), cid, pg_temp.k('c9'), pg_temp.k('pro1'), pg_temp.k('proc7'), pg_temp.k('qi2b'), (pg_temp.wd(hoje + 3) + time '09:00') at time zone 'America/Sao_Paulo', (pg_temp.wd(hoje + 3) + time '09:30') at time zone 'America/Sao_Paulo', 'agendado', null, own, nowt - interval '5 days'),
    (pg_temp.k('sess3a'), cid, pg_temp.k('c14'), pg_temp.k('pro3'), pg_temp.k('proc9'), pg_temp.k('qi3a'), (pg_temp.wd(hoje - 9) + time '10:00') at time zone 'America/Sao_Paulo', (pg_temp.wd(hoje - 9) + time '12:00') at time zone 'America/Sao_Paulo', 'realizado', null, own, nowt - interval '10 days'),
    (pg_temp.k('sess3b'), cid, pg_temp.k('c14'), pg_temp.k('pro3'), pg_temp.k('proc9'), pg_temp.k('qi3a'), (pg_temp.wd(hoje + 6) + time '14:00') at time zone 'America/Sao_Paulo', (pg_temp.wd(hoje + 6) + time '16:00') at time zone 'America/Sao_Paulo', 'confirmado', null, own, nowt - interval '5 days'),
    (pg_temp.k('sess1a'), cid, pg_temp.k('c5'),  pg_temp.k('pro2'), pg_temp.k('proc6'), pg_temp.k('qi1a'), (pg_temp.wd(hoje - 20) + time '08:00') at time zone 'America/Sao_Paulo', (pg_temp.wd(hoje - 20) + time '10:00') at time zone 'America/Sao_Paulo', 'realizado', null, own, nowt - interval '22 days');

  -- sessões do plano tomam o horário: tira consultas avulsas que bateriam com elas (e cobranças órfãs)
  delete from appointments a using appointments x
   where a.clinic_id = cid and x.clinic_id = cid and x.quote_item_id is not null and a.quote_item_id is null
     and a.professional_id = x.professional_id and a.starts_at < x.ends_at and a.ends_at > x.starts_at;
  delete from charges where clinic_id = cid and appointment_id is null;

  -- ===== COBRANÇAS =====
  -- 1) consultas realizadas viraram cobrança (gatilho do sistema); aqui só ajustamos vencimento, pagamento e forma
  update charges c set
    due_date = (a.starts_at at time zone 'America/Sao_Paulo')::date,
    status = case when (a.starts_at < nowt - interval '20 days' and abs(hashtext(c.id::text)) % 100 < 99)
                    or (a.starts_at between nowt - interval '20 days' and nowt - interval '3 days' and abs(hashtext(c.id::text)) % 100 < 94)
                    or (a.starts_at > nowt - interval '3 days' and abs(hashtext(c.id::text)) % 100 < 80)
                  then 'pago' else 'aberto' end,
    payment_method = (array['pix','pix','pix','pix','credito','credito','credito','debito','debito','dinheiro','boleto','transferencia'])[1 + abs(hashtext('m' || c.id::text)) % 12],
    installments = 1
  from appointments a where a.id = c.appointment_id and c.clinic_id = cid;
  update charges c set
    paid_at = least(nowt - interval '5 minutes', a.ends_at + ((abs(hashtext('p' || c.id::text)) % 36) || ' hours')::interval),
    installments = case when c.payment_method = 'credito' then (array[1,1,2,3,4,6])[1 + abs(hashtext('i' || c.id::text)) % 6] else 1 end
  from appointments a where a.id = c.appointment_id and c.clinic_id = cid and c.status = 'pago';
  update charges set payment_method = null where clinic_id = cid and status = 'aberto';

  -- 2) cobranças dos orçamentos aprovados (mesma lógica de "aprovar orçamento")
  -- q1: cartão em 10x = uma cobrança paga
  insert into charges (clinic_id, contact_id, quote_id, description, amount, due_date, status, paid_at, payment_method, installments)
  values (cid, pg_temp.k('c5'), pg_temp.k('q1'), 'Orçamento nº 1', quote_total(pg_temp.k('q1')), hoje - 21, 'pago', nowt - interval '21 days', 'credito', 10);
  -- q2: boleto em 12x, primeira paga na aprovação
  for i in 1..12 loop
    insert into charges (clinic_id, contact_id, quote_id, description, amount, due_date, status, paid_at, payment_method, installment_no, installment_of)
    values (cid, pg_temp.k('c9'), pg_temp.k('q2'), 'Orçamento nº 2 · parcela ' || i || '/12', case when i = 12 then 7800 - 650 * 11 else 650 end,
            (hoje - 68 + (i - 1) * 30), case when (hoje - 68 + (i - 1) * 30) <= hoje - 1 then 'pago' else 'aberto' end,
            case when (hoje - 68 + (i - 1) * 30) <= hoje - 1 then (hoje - 68 + (i - 1) * 30 + 1)::timestamptz end, 'boleto', i, 12);
  end loop;
  -- q3: pix em 2x, entrada paga
  insert into charges (clinic_id, contact_id, quote_id, description, amount, due_date, status, paid_at, payment_method, installment_no, installment_of) values
    (cid, pg_temp.k('c14'), pg_temp.k('q3'), 'Orçamento nº 3 · parcela 1/2', 5000, hoje - 10, 'pago', nowt - interval '10 days', 'pix', 1, 2),
    (cid, pg_temp.k('c14'), pg_temp.k('q3'), 'Orçamento nº 3 · parcela 2/2', 5000, hoje + 20, 'aberto', null, 'pix', 2, 2);
  -- q4: cartão em 3x
  insert into charges (clinic_id, contact_id, quote_id, description, amount, due_date, status, paid_at, payment_method, installments)
  values (cid, pg_temp.k('c21'), pg_temp.k('q4'), 'Orçamento nº 4', quote_total(pg_temp.k('q4')), hoje - 4, 'pago', nowt - interval '4 days', 'credito', 3);
  -- uma cobrança avulsa em atraso e outra a vencer (para a régua de cobrança aparecer no financeiro)
  insert into charges (clinic_id, contact_id, description, amount, due_date, status, payment_method) values
    (cid, pg_temp.k('c18'), 'Restauração em resina (saldo)', 280, hoje - 12, 'aberto', null),
    (cid, pg_temp.k('c26'), 'Manutenção ortodôntica', 250, hoje - 6, 'aberto', null),
    (cid, pg_temp.k('c35'), 'Clareamento a laser (parcela 2/2)', 600, hoje + 4, 'aberto', null),
    (cid, pg_temp.k('c40'), 'Limpeza + restauração', 500, hoje + 9, 'aberto', null);

  -- ===== DESPESAS (3 meses) =====
  for m in 0..2 loop
    mm := (mes0 - ((2 - m) || ' months')::interval)::date;     -- m=0: dois meses atrás ... m=2: mês atual
    for rec in select * from (values
      ('Aluguel e condomínio da sala', 'aluguel', 7800, 5, 'boleto'),
      ('Dental Cremer - materiais e insumos', 'material', 6400, 10, 'boleto'),
      ('Descartáveis e EPI', 'material', 2500, 18, 'pix'),
      ('Laboratório Prótese Ideal', 'laboratorio', 4800, 12, 'pix'),
      ('Laboratório Sorriso Digital (lentes e coroas)', 'laboratorio', 3200, 24, 'pix'),
      ('Folha: recepção e auxiliares', 'salarios', 9500, 5, 'transferencia'),
      ('Simples Nacional', 'impostos', 7400, 20, 'boleto'),
      ('Meta Ads (anúncios)', 'marketing', 5000, 1, 'credito'),
      ('Agência de tráfego', 'marketing', 1800, 8, 'pix'),
      ('Contabilidade', 'servicos', 780, 15, 'pix'),
      ('Fluxa: sistema e automações', 'servicos', 594, 3, 'credito'),
      ('Energia, água e internet', 'servicos', 1150, 12, 'boleto'),
      ('Limpeza', 'servicos', 1300, 8, 'pix')
    ) as x(descr, cat, amt, dia, forma) loop
      dd := mm + (rec.dia - 1);
      insert into expenses (clinic_id, description, category, amount, due_date, status, paid_at, payment_method, created_by)
      values (cid, rec.descr, rec.cat, round((rec.amt * (0.94 + (abs(hashtext(rec.descr || m)) % 13) / 100.0))::numeric, 2), dd,
              case when dd <= hoje then 'pago' else 'aberto' end,
              case when dd <= hoje then (dd + time '10:00') at time zone 'America/Sao_Paulo' end, rec.forma, own);
    end loop;
  end loop;
  -- aluguel do mês que vem, já lançado
  insert into expenses (clinic_id, description, category, amount, due_date, status, payment_method, created_by)
  values (cid, 'Aluguel e condomínio da sala', 'aluguel', 7800, (mes0 + interval '1 month' + interval '4 days')::date, 'aberto', 'boleto', own);
  -- comissões dos dois meses fechados, calculadas sobre o recebido (consultas), por profissional
  for m in 0..1 loop
    mm := (mes0 - ((2 - m) || ' months')::interval)::date;
    me := (mm + interval '1 month')::date;
    for p in 1..5 loop
      select coalesce(sum(c.amount * coalesce(x.commission_pct, pr.commission_pct, 0) / 100.0), 0) into v
        from charges c join appointments a on a.id = c.appointment_id join professionals pr on pr.id = a.professional_id
        left join professional_procedures x on x.professional_id = a.professional_id and x.procedure_id = a.procedure_id
       where c.clinic_id = cid and c.status = 'pago' and a.professional_id = pg_temp.k('pro' || p)
         and (c.paid_at at time zone 'America/Sao_Paulo')::date >= mm and (c.paid_at at time zone 'America/Sao_Paulo')::date < me;
      if v > 0 then
        insert into expenses (clinic_id, description, category, amount, due_date, status, paid_at, payment_method, professional_id, meta, created_by)
        values (cid, 'Comissão ' || prn[p] || ' · ' || to_char(mm, 'MM/YYYY'), 'comissao', round(v, 2), me + 9, 'pago', ((me + 9) + time '10:00') at time zone 'America/Sao_Paulo', 'transferencia',
                pg_temp.k('pro' || p), jsonb_build_object('mes', to_char(mm, 'YYYY-MM')), own);
      end if;
    end loop;
  end loop;

  -- ===== LISTA DE ESPERA =====
  insert into waitlist (clinic_id, contact_id, procedure_id, procedure_text, status, created_at) values
    (cid, pg_temp.k('c20'), pg_temp.k('proc1'), null, 'aguardando', nowt - interval '6 days'),
    (cid, pg_temp.k('c22'), pg_temp.k('proc4'), null, 'aguardando', nowt - interval '5 days'),
    (cid, pg_temp.k('c24'), pg_temp.k('proc2'), null, 'aguardando', nowt - interval '3 days'),
    (cid, pg_temp.k('c25'), null, 'Troca de restauração (manhã)', 'aguardando', nowt - interval '2 days'),
    (cid, pg_temp.k('c28'), pg_temp.k('proc11'), null, 'ofertado', nowt - interval '2 days'),
    (cid, pg_temp.k('c29'), pg_temp.k('proc3'), null, 'agendado', nowt - interval '4 days');

  -- ===== LINHA DO TEMPO e TAREFAS =====
  -- leads: origem e resposta
  for i in 80..110 loop
    insert into activities (clinic_id, contact_id, type, body, created_at) values
      (cid, pg_temp.k('c' || i), 'sistema', 'Lead criado pelo anúncio (Meta Ads).', (select created_at from contacts where id = pg_temp.k('c' || i)));
    if i between 89 and 101 then
      insert into activities (clinic_id, contact_id, type, body, created_at) values
        (cid, pg_temp.k('c' || i), 'whatsapp', 'Respondeu no WhatsApp: ' || (array['Oi, quero saber o valor.','Tem horário essa semana?','Aceita parcelar no cartão?','Vocês fazem avaliação gratuita?'])[1 + i % 4],
         (select created_at from contacts where id = pg_temp.k('c' || i)) + interval '40 minutes');
    end if;
    if i between 96 and 101 then
      insert into activities (clinic_id, contact_id, type, body, created_at) values
        (cid, pg_temp.k('c' || i), 'etapa', 'Etapa: Avaliação agendada', (select created_at from contacts where id = pg_temp.k('c' || i)) + interval '3 hours');
    end if;
  end loop;
  -- pacientes: confirmações e anotações
  for i in 1..n_pool loop
    if i % 2 = 0 then
      insert into activities (clinic_id, contact_id, type, body, created_at)
      values (cid, pg_temp.k('c' || i), 'whatsapp', 'Respondeu no WhatsApp: Confirmo', nowt - ((1 + abs(hashtext('a' || i)) % 40) || ' days')::interval);
    end if;
    if i % 5 = 0 then
      insert into activities (clinic_id, contact_id, type, body, user_id, created_at)
      values (cid, pg_temp.k('c' || i), 'nota', (array['Paciente pontual e muito satisfeita com o atendimento.','Pediu orçamento por escrito para o convênio de reembolso.','Prefere contato por WhatsApp, não atende ligações.','Indicou duas amigas para avaliação.'])[1 + i % 4], own, nowt - ((2 + abs(hashtext('n' || i)) % 60) || ' days')::interval);
    end if;
  end loop;
  insert into activities (clinic_id, contact_id, deal_id, type, body, created_at) values
    (cid, pg_temp.k('c30'), pg_temp.k('dq5'), 'ligacao', 'Ligou para tirar dúvida sobre o enxerto. Explicado o passo a passo; vai conversar com a esposa.', nowt - interval '2 days'),
    (cid, pg_temp.k('c37'), pg_temp.k('dq6'), 'whatsapp', 'Perguntou se dá para dividir em 18x. Respondido que sim, no boleto ou no cartão.', nowt - interval '20 hours'),
    (cid, pg_temp.k('c44'), pg_temp.k('dq7'), 'nota', 'Quer fechar antes do casamento em dezembro.', nowt - interval '4 days');
  -- tarefas (2 atrasadas, 4 de hoje, 4 de amanhã, o resto adiante)
  insert into activities (clinic_id, contact_id, type, body, due_at, user_id) values
    (cid, pg_temp.k('c44'), 'tarefa', 'Ligar para a paciente do orçamento nº 7 (válido até depois de amanhã)', nowt - interval '1 day', own),
    (cid, pg_temp.k('c30'), 'tarefa', 'Retornar sobre o orçamento nº 5 e oferecer parcelamento', nowt - interval '3 hours', own),
    (cid, pg_temp.k('c89'), 'tarefa', 'Enviar fotos de antes e depois de clareamento', nowt + interval '1 hour', own),
    (cid, pg_temp.k('c91'), 'tarefa', 'Confirmar avaliação de amanhã', nowt + interval '3 hours', own),
    (cid, pg_temp.k('c26'), 'tarefa', 'Cobrar a manutenção em atraso (R$ 250)', nowt + interval '4 hours', own),
    (cid, pg_temp.k('c18'), 'tarefa', 'Cobrar saldo da restauração', nowt + interval '5 hours', own),
    (cid, pg_temp.k('c37'), 'tarefa', 'Responder dúvida sobre parcelamento dos alinhadores', nowt + interval '26 hours', own),
    (cid, pg_temp.k('c63'), 'tarefa', 'Perguntar sobre o orçamento dos sisos', nowt + interval '28 hours', own),
    (cid, pg_temp.k('c80'), 'tarefa', 'Primeiro contato com o lead novo', nowt + interval '30 hours', own),
    (cid, pg_temp.k('c93'), 'tarefa', 'Enviar valores de lentes de porcelana', nowt + interval '32 hours', own),
    (cid, pg_temp.k('c58'), 'tarefa', 'Ligar para perguntar como foi a decisão do orçamento recusado', nowt + interval '5 days', own),
    (cid, pg_temp.k('c12'), 'tarefa', 'Pedir avaliação no Google para a paciente do clareamento', nowt + interval '3 days', own);

  -- ===== FICHA CLÍNICA =====
  insert into anamneses (contact_id, clinic_id, data, updated_by, updated_at)
  select pg_temp.k('c' || g.i), cid,
         jsonb_build_object(
           'queixa', (array['Quer clarear os dentes para o casamento.','Dor ao mastigar do lado direito.','Quer alinhar os dentes da frente.','Gengiva sangrando ao escovar.','Quer repor um dente perdido.','Incômodo com sorriso gengival.'])[1 + g.i % 6],
           'alergias', case when g.i % 4 = 0 then 'Alergia a dipirona e a látex.' else 'Nega alergias.' end,
           'medicamentos', case when g.i % 3 = 0 then 'Losartana 50 mg, 1x ao dia.' when g.i % 5 = 0 then 'Anticoncepcional.' else 'Nenhum.' end,
           'doencas', case when g.i % 3 = 0 then 'Hipertensão controlada.' else 'Sem doenças relevantes.' end,
           'cirurgias', case when g.i % 4 = 1 then 'Extração de sisos em 2019.' else 'Nenhuma.' end,
           'observacoes', 'Ficha preenchida na primeira consulta.',
           'hipertensao', g.i % 3 = 0, 'diabetes', g.i % 7 = 0, 'fumante', g.i % 6 = 0, 'gestante', g.i = 8, 'anticoagulante', g.i = 14),
         own, nowt - ((10 + g.i * 5) || ' days')::interval
    from generate_series(1, 18) as g(i);
  insert into clinical_notes (clinic_id, contact_id, appointment_id, professional_id, body, created_by, created_at)
  select a.clinic_id, a.contact_id, a.id, a.professional_id,
         bodies[(select g.i from generate_series(1, 12) as g(i) where pg_temp.k('proc' || g.i) = a.procedure_id)], own, a.ends_at + interval '10 minutes'
    from (select * from appointments where clinic_id = cid and status = 'realizado' and contact_id is not null and procedure_id is not null
            and abs(hashtext(id::text)) % 100 < 7 order by starts_at desc limit 40) a;

  -- ===== MARKETING COM IA =====
  insert into copies (clinic_id, kind, topic, content, created_by, created_at) values
    (cid, 'anuncio', 'Clareamento a laser para o fim de ano', jsonb_build_object('itens', jsonb_build_array(
       jsonb_build_object('titulo','Variação 1 · Direto','texto','Sorriso mais claro para as festas de fim de ano. Clareamento a laser em uma sessão, com avaliação completa antes. Chame no WhatsApp e veja os horários desta semana.','extra','Título: Clareamento a laser com avaliação | CTA: Enviar mensagem'),
       jsonb_build_object('titulo','Variação 2 · Prova social','texto','Pacientes da Clínica Aurora saem da primeira sessão com o sorriso até 8 tons mais claro (resultado varia de pessoa para pessoa). Avaliação antes de qualquer procedimento.','extra','Título: Sorriso mais claro, com segurança | CTA: Saiba mais'),
       jsonb_build_object('titulo','Variação 3 · Pergunta','texto','Seu sorriso combina com a ceia? Venha fazer uma avaliação e descubra se o clareamento é indicado para você.','extra','Título: Avaliação de clareamento | CTA: Agendar avaliação')),
       'alertas', jsonb_build_array('Não prometa resultado garantido: o CFO exige que anúncios de odontologia não façam promessa de cura ou resultado.','Evite "antes e depois" sem termo de consentimento do paciente.')), own, nowt - interval '6 days'),
    (cid, 'whatsapp', 'Resposta ao lead que perguntou o valor das lentes', jsonb_build_object('itens', jsonb_build_array(
       jsonb_build_object('titulo','Rotulagem e pergunta calibrada','texto','Parece que você quer ter certeza do investimento antes de decidir, e isso faz todo sentido. O que mais pesa para você hoje: o valor total, a forma de pagar ou o resultado final?','extra','Técnica: rotulagem + pergunta calibrada (Voss)'),
       jsonb_build_object('titulo','Pergunta orientada para o não','texto','Seria ruim se eu te mostrasse os casos de pacientes que tinham a mesma dúvida que você, antes de falarmos de valores?','extra','Técnica: pergunta orientada para o "não"')),
       'alertas', jsonb_build_array()), own, nowt - interval '3 days'),
    (cid, 'legenda', 'Post de Instagram: cuidado com a higiene no fim de ano', jsonb_build_object('itens', jsonb_build_array(
       jsonb_build_object('titulo','Legenda','texto','Dezembro chegou e a agenda enche. Que tal incluir a limpeza dos dentes na sua lista de fim de ano? Prevenir sai mais barato que tratar. Chame no WhatsApp e escolha o melhor horário.','extra','#odontologia #saudebucal #sorriso #clinicaaurora')),
       'alertas', jsonb_build_array()), own, nowt - interval '9 days');
  insert into campaigns (clinic_id, name, objective, daily_budget, plan, status, created_by, created_at) values
    (cid, 'Clareamento: avaliação gratuita de fim de ano', 'agendar', 60,
     jsonb_build_object('resumo','Campanha de conversas no WhatsApp para agendar avaliações de clareamento em São Paulo, com orçamento diário de R$ 60.',
       'estrutura','1 campanha, 2 conjuntos de anúncios (mulheres 25-45 e homens 30-50), 3 anúncios por conjunto.',
       'objetivo_meta','Engajamento > Conversas por mensagem (WhatsApp).',
       'publico', jsonb_build_object('Localização','Raio de 8 km da clínica','Idade','25 a 50 anos','Interesses','Estética, saúde e bem-estar'),
       'orcamento','R$ 60 por dia, R$ 30 por conjunto. Não mexa nos primeiros 4 dias.',
       'anuncios', jsonb_build_array(
         jsonb_build_object('nome','Anúncio 1','angulo','Dor: sorriso amarelado','gancho','Seu sorriso mais claro antes das festas','texto_principal','Avaliação completa e clareamento a laser em uma sessão. Chame no WhatsApp e veja os horários da semana.'),
         jsonb_build_object('nome','Anúncio 2','angulo','Segurança','gancho','Clareamento com avaliação do dentista','texto_principal','Antes de clarear, a gente avalia seus dentes e gengiva. Sem pressa e sem improviso.')),
       'mensagem_whatsapp','Oi! Vi o anúncio do clareamento e quero saber os horários da avaliação.',
       'cronograma', jsonb_build_array('Dias 1 a 4: não alterar nada.','Dia 5: pausar anúncios com custo por conversa acima de R$ 25.','Dia 7: duplicar o melhor conjunto com +20% de orçamento.'),
       'metricas', jsonb_build_array('Custo por conversa iniciada (meta: até R$ 18).','Conversas que viram avaliação (meta: 1 a cada 3).','Faltas nas avaliações (meta: abaixo de 15%).'),
       'alertas', jsonb_build_array('Não use "garantido" nem promessa de resultado.','Tenha o CRO do responsável técnico no perfil.')),
     'ativa', own, nowt - interval '8 days'),
    (cid, 'Implantes: captação de pacientes acima de 45 anos', 'procedimento', 90,
     jsonb_build_object('resumo','Campanha para captar avaliações de implante dentário com orçamento de R$ 90 por dia.',
       'estrutura','1 campanha, 1 conjunto aberto, 2 anúncios.','objetivo_meta','Engajamento > Conversas por mensagem (WhatsApp).',
       'publico', jsonb_build_object('Localização','Raio de 10 km','Idade','45 a 65 anos'),
       'orcamento','R$ 90 por dia.','anuncios', jsonb_build_array(jsonb_build_object('nome','Anúncio 1','angulo','Mastigar sem medo','gancho','Voltar a mastigar sem medo','texto_principal','Planejamento digital do implante com o Dr. Rafael Menezes (CRO-SP 64.920). Chame e agende a avaliação.')),
       'mensagem_whatsapp','Oi! Quero saber como funciona a avaliação para implante.',
       'cronograma', jsonb_build_array('Dia 1: publicar.','Dia 5: revisar.'),'metricas', jsonb_build_array('Custo por conversa.'),'alertas', jsonb_build_array()),
     'planejada', own, nowt - interval '2 days');
  -- consumo de IA do mês (aparece nos limites do plano)
  insert into ai_usage (clinic_id, kind, feature, tokens_in, tokens_out, user_id, created_at)
  select cid, case when g.i <= 18 then 'text' else 'image' end, case when g.i <= 18 then (array['textos','campanha','criativo'])[1 + g.i % 3] else 'arte' end,
         800 + g.i * 31, 450 + g.i * 17, own, least(nowt, mes0::timestamptz + ((g.i * 29) % (greatest(1, extract(day from hoje)::int) * 24) || ' hours')::interval)
    from generate_series(1, 26) as g(i);

  -- ===== AUTOMAÇÕES e INTEGRAÇÃO (para as telas de Automações e Chaves de API) =====
  insert into automation_requests (clinic_id, flows, status, setup_cents, monthly_cents, contact_name, contact_phone, notes, requested_by)
  values (cid, array['B1','C1','C2','C3','C4','C5','C6','C7','CB'], 'ativo', 79700, 39700, 'Bianca Moraes', '5511900000000', 'Conta de demonstração', own);
  insert into api_keys (clinic_id, name, prefix, key_hash, created_by)
  values (cid, 'n8n (demonstração)', 'flx_demo', encode(digest('chave-de-demonstracao-sem-uso-' || cid::text, 'sha256'), 'hex'), own);

  -- ===== ACABAMENTO: última visita de cada paciente =====
  update contacts c set last_visit_at = x.last
    from (select contact_id, max(starts_at) as last from appointments where clinic_id = cid and status = 'realizado' and contact_id is not null group by contact_id) x
   where c.id = x.contact_id;
  -- pacientes que dormiram: tira a última visita de 7 deles (lista de reativação)
  update contacts set last_visit_at = nowt - ((120 + abs(hashtext(id::text)) % 150) || ' days')::interval
   where clinic_id = cid and id in (pg_temp.k('c3'), pg_temp.k('c13'), pg_temp.k('c23'), pg_temp.k('c34'), pg_temp.k('c45'), pg_temp.k('c56'), pg_temp.k('c67'));
end
$demo$;

-- conferência rápida (aparece no resultado do SQL Editor)
select
  (select count(*) from contacts where clinic_id = 'a0a0a0a0-0000-4000-8000-00000000a001') as pacientes_e_leads,
  (select count(*) from appointments where clinic_id = 'a0a0a0a0-0000-4000-8000-00000000a001') as consultas,
  (select count(*) from appointments where clinic_id = 'a0a0a0a0-0000-4000-8000-00000000a001' and starts_at >= now()) as consultas_futuras,
  (select count(*) from charges where clinic_id = 'a0a0a0a0-0000-4000-8000-00000000a001') as cobrancas,
  (select count(*) from quotes where clinic_id = 'a0a0a0a0-0000-4000-8000-00000000a001') as orcamentos,
  (select count(*) from expenses where clinic_id = 'a0a0a0a0-0000-4000-8000-00000000a001') as despesas;
