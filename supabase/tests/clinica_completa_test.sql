\set ON_ERROR_STOP 1
-- Roda depois de 0007, numa base com a Clínica Sorriso (dono e1) e a paciente Maria Souza
grant all on all tables in schema public to authenticated, service_role;
select id as c1 from clinics where name = 'Clínica Sorriso' \gset
select id as maria from contacts where clinic_id = :'c1' and name = 'Maria Souza' \gset
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f3', 'recepcao7@s.com') on conflict do nothing;
insert into memberships (clinic_id, user_id, role) values (:'c1', '00000000-0000-0000-0000-0000000000f3', 'staff') on conflict do nothing;
insert into clinics (name, kind) values ('Clínica Outra 7', 'odonto') returning id as c2 \gset
insert into contacts (clinic_id, name) values (:'c2', 'Paciente de fora') returning id as fora \gset

set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000e1',false) \g /dev/null
insert into professionals (clinic_id, name, commission_pct) values (:'c1', 'Dra. Teste 7', 30) returning id as pro \gset
insert into procedures (clinic_id, name, duration_min, price) values (:'c1', 'Implante T7', 90, 3000) returning id as impl \gset

-- ---------- Orçamento: número, total, aprovação em 3x com entrada
insert into quotes (clinic_id, contact_id, professional_id) values (:'c1', :'maria', :'pro') returning id as q1, number as n1 \gset
insert into quotes (clinic_id, contact_id) values (:'c1', :'maria') returning id as q2, number as n2 \gset
select :n2 = :n1 + 1 as "1_numero_sequencial";
insert into quote_items (clinic_id, quote_id, procedure_id, description, qty, unit_price) values
  (:'c1', :'q1', :'impl', 'Implante T7', 2, 3000), (:'c1', :'q1', null, 'Coroa provisória', 1, 500.10);
select id as item1 from quote_items where quote_id = :'q1' and description = 'Implante T7' \gset
update quotes set discount = 100 where id = :'q1';
select quote_total(:'q1') = 6400.10 as "2_total_com_desconto";
select approve_quote(:'q1', 'pix', 3, '2026-12-10', true) = 6400.10 as "3_aprovou";
select count(*) = 3 and sum(amount) = 6400.10 as "4_tres_parcelas_somam_o_total" from charges where quote_id = :'q1';
select string_agg(status || ':' || amount || ':' || due_date, ' ' order by due_date) = 'pago:2133.36:2026-12-10 aberto:2133.36:2027-01-10 aberto:2133.38:2027-02-10' as "5_entrada_paga_e_vencimentos_mensais" from charges where quote_id = :'q1';
select status = 'aprovado' and payment->>'parcelas' = '3' as "6_orcamento_aprovado" from quotes where id = :'q1';
select s.kind = 'won' and d.value = 6400.10 and d.closed_at is not null as "7_oportunidade_ganha" from quotes q join deals d on d.id = q.deal_id join stages s on s.id = d.stage_id where q.id = :'q1';
do $$ begin
  begin perform approve_quote((select id from quotes where professional_id is not null and status = 'aprovado' limit 1), 'pix', 1, null, false); raise exception 'FALHOU';
  exception when others then if sqlerrm = 'FALHOU' then raise; end if; raise notice 'ok: não aprova duas vezes (%)', sqlerrm; end;
end $$;

-- cartão de crédito 10x: uma cobrança paga com 10 parcelas
insert into quote_items (clinic_id, quote_id, description, qty, unit_price) values (:'c1', :'q2', 'Clareamento', 1, 1200);
select approve_quote(:'q2', 'credito', 10, null, false) \g /dev/null
select count(*) = 1 and bool_and(status = 'pago' and installments = 10 and payment_method = 'credito' and amount = 1200) as "8_cartao_10x_uma_cobranca_paga" from charges where quote_id = :'q2';

-- ---------- Sessão do plano não cobra de novo ao marcar realizado
insert into appointments (clinic_id, contact_id, professional_id, procedure_id, quote_item_id, starts_at, ends_at, status, price)
  values (:'c1', :'maria', :'pro', :'impl', :'item1', now() - interval '3 hours', now() - interval '90 minutes', 'agendado', 3000) returning id as ses \gset
update appointments set status = 'realizado' where id = :'ses';
select count(*) = 0 as "9_sessao_do_plano_nao_gera_cobranca" from charges where appointment_id = :'ses';
-- consulta comum continua cobrando
insert into appointments (clinic_id, contact_id, starts_at, ends_at, status, price, procedure_text) values (:'c1', :'maria', now() - interval '5 hours', now() - interval '4 hours', 'realizado', 250, 'Limpeza') returning id as ap \gset
select count(*) = 1 as "10_consulta_comum_cobra" from charges where appointment_id = :'ap';
-- forma de pagamento inválida é recusada
do $$ begin
  begin update charges set payment_method = 'cheque' where appointment_id is not null; raise exception 'FALHOU';
  exception when others then if sqlerrm = 'FALHOU' then raise; end if; raise notice 'ok: forma inválida recusada'; end;
end $$;

-- ---------- Referências de outra clínica
do $$ begin
  begin insert into quotes (clinic_id, contact_id) values ((select id from clinics where name='Clínica Sorriso'), (select id from contacts where name='Paciente de fora')); raise exception 'FALHOU';
  exception when others then if sqlerrm = 'FALHOU' then raise; end if; raise notice 'ok: orçamento com paciente de outra clínica recusado'; end;
end $$;
do $$ begin
  begin insert into business_hours (clinic_id, professional_id, weekday, start_time, end_time) values ((select id from clinics where name='Clínica Outra 7'), (select id from professionals where name='Dra. Teste 7'), 1, '08:00', '12:00'); raise exception 'FALHOU';
  exception when others then if sqlerrm = 'FALHOU' then raise; end if; raise notice 'ok: horário com profissional de outra clínica recusado'; end;
end $$;
insert into business_hours (clinic_id, professional_id, weekday, start_time, end_time) values (:'c1', :'pro', 2, '14:00', '18:00');
insert into professional_procedures (clinic_id, professional_id, procedure_id, commission_pct) values (:'c1', :'pro', :'impl', 40);
select count(*) = 1 as "11_horario_e_procedimento_do_profissional" from professional_procedures where professional_id = :'pro';

-- ---------- Despesas: só dono/admin
insert into expenses (clinic_id, description, category, amount, due_date, status, paid_at) values (:'c1', 'Aluguel', 'aluguel', 3500, current_date, 'pago', now());
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000f3',false) \g /dev/null
select count(*) = 0 as "12_recepcao_nao_ve_despesas" from expenses;
do $$ begin
  begin insert into expenses (clinic_id, description, amount, due_date) values ((select id from clinics where name='Clínica Sorriso'), 'x', 10, current_date); raise exception 'FALHOU';
  exception when others then if sqlerrm = 'FALHOU' then raise; end if; raise notice 'ok: recepção não lança despesa'; end;
end $$;
select count(*) >= 2 as "13_recepcao_ve_orcamentos" from quotes;

-- ---------- Ficha clínica: só dono ou quem tem acesso
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000e1',false) \g /dev/null
insert into anamneses (contact_id, clinic_id, data) values (:'maria', :'c1', '{"alergias":"dipirona"}') on conflict (contact_id) do update set data = excluded.data;
insert into clinical_notes (clinic_id, contact_id, body, created_by) values (:'c1', :'maria', 'Instalado implante 36.', '00000000-0000-0000-0000-0000000000e1');
insert into patient_files (clinic_id, contact_id, path) values (:'c1', :'maria', :'c1' || '/pacientes/' || :'maria' || '/00000000-0000-0000-0000-000000000001.jpg');
insert into storage.objects (bucket_id, name) values ('clinic-files', :'c1' || '/pacientes/' || :'maria' || '/00000000-0000-0000-0000-000000000001.jpg');
insert into storage.objects (bucket_id, name) values ('clinic-files', :'c1' || '/marca/00000000-0000-0000-0000-000000000002.png');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000f3',false) \g /dev/null
select (select count(*) from anamneses) = 0 and (select count(*) from clinical_notes) = 0 and (select count(*) from patient_files) = 0 as "14_recepcao_sem_acesso_nao_ve_ficha";
select (select count(*) from storage.objects where name like '%/pacientes/%') = 0 and (select count(*) from storage.objects where name like '%/marca/%') >= 1 as "15_recepcao_nao_ve_fotos_mas_ve_logo";
do $$ begin
  begin update memberships set clinical_access = true where user_id = '00000000-0000-0000-0000-0000000000f3';
    if (select clinical_access from memberships where user_id = '00000000-0000-0000-0000-0000000000f3') then raise exception 'FALHOU'; end if;
    raise notice 'ok: recepção não se dá acesso (nada mudou)';
  exception when others then if sqlerrm = 'FALHOU' then raise; end if; raise notice 'ok: recepção não se dá acesso (%)', sqlerrm; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000e1',false) \g /dev/null
update memberships set clinical_access = true where user_id = '00000000-0000-0000-0000-0000000000f3';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000f3',false) \g /dev/null
select (select count(*) from anamneses) = 1 and (select count(*) from clinical_notes) >= 1 and (select count(*) from storage.objects where name like '%/pacientes/%') = 1 as "16_com_acesso_ve_ficha_e_fotos";
do $$ begin
  begin update clinical_notes set body = 'alterado';
    if exists (select 1 from clinical_notes where body = 'alterado') then raise exception 'FALHOU'; end if;
    raise notice 'ok: evolução não é editada';
  exception when others then if sqlerrm = 'FALHOU' then raise; end if; raise notice 'ok: evolução não é editada (%)', sqlerrm; end;
end $$;
do $$ begin
  begin insert into clinical_notes (clinic_id, contact_id, body, created_by) values ((select id from clinics where name='Clínica Sorriso'), (select id from contacts where name='Maria Souza'), 'x', '00000000-0000-0000-0000-0000000000e1'); raise exception 'FALHOU';
  exception when others then if sqlerrm = 'FALHOU' then raise; end if; raise notice 'ok: não registra evolução em nome de outro'; end;
end $$;

-- ---------- Paciente excluído (LGPD) leva a ficha junto
reset role;
insert into contacts (clinic_id, name) values (:'c1', 'Apagar T7') returning id as del \gset
insert into anamneses (contact_id, clinic_id, data) values (:'del', :'c1', '{}');
insert into clinical_notes (clinic_id, contact_id, body) values (:'c1', :'del', 'x');
delete from contacts where id = :'del';
select (select count(*) from anamneses where contact_id = :'del') + (select count(*) from clinical_notes where contact_id = :'del') = 0 as "17_excluir_paciente_apaga_ficha";

-- limpeza
delete from charges where quote_id in (:'q1', :'q2') or appointment_id = :'ap';
delete from appointments where id in (:'ses', :'ap');
delete from deals where id in (select deal_id from quotes where id in (:'q1', :'q2'));
delete from quotes where id in (:'q1', :'q2');
delete from expenses where clinic_id = :'c1';
delete from anamneses where contact_id = :'maria'; delete from clinical_notes where contact_id = :'maria'; delete from patient_files where contact_id = :'maria';
delete from storage.objects where name like :'c1' || '%';
delete from professional_procedures where professional_id = :'pro'; delete from business_hours where professional_id = :'pro';
delete from professionals where id = :'pro'; delete from procedures where id = :'impl';
delete from memberships where user_id = '00000000-0000-0000-0000-0000000000f3';
delete from clinics where id = :'c2';
select 'CLINICA COMPLETA OK' as r;
