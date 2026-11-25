\set ON_ERROR_STOP 1
-- Roda depois de 0006, numa base com a Clínica Sorriso (dono e1) e a paciente Maria Souza
grant all on all tables in schema public to authenticated, service_role;
select id as c1 from clinics where name = 'Clínica Sorriso' \gset
select id as maria from contacts where clinic_id = :'c1' and name = 'Maria Souza' \gset
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000e1',false) \g /dev/null
insert into appointments (clinic_id, contact_id, starts_at, ends_at, status, procedure_text, price)
  values (:'c1', :'maria', now() - interval '2 hours', now() - interval '1 hour', 'agendado', 'Botox', 900) returning id as ap \gset
select count(*) = 0 as "1_agendado_nao_cobra" from charges where appointment_id = :'ap';
update appointments set status = 'realizado' where id = :'ap';
select status = 'aberto' and amount = 900 and due_date = (now() at time zone 'America/Sao_Paulo')::date and description like 'Botox (%' as "2_realizado_cria_cobranca_hoje" from charges where appointment_id = :'ap';
update appointments set status = 'realizado' where id = :'ap';
select count(*) = 1 as "3_marcar_de_novo_nao_duplica" from charges where appointment_id = :'ap';
update appointments set price = 850 where id = :'ap';
select amount = 850 as "4_valor_acompanha" from charges where appointment_id = :'ap';
update appointments set status = 'confirmado' where id = :'ap';
select status = 'cancelado' as "5_desfazer_cancela" from charges where appointment_id = :'ap';
update appointments set status = 'realizado' where id = :'ap';
select status = 'aberto' and amount = 850 as "6_realizado_de_novo_reabre" from charges where appointment_id = :'ap';
update charges set status = 'pago', paid_at = now() where appointment_id = :'ap';
update appointments set status = 'faltou' where id = :'ap';
select status = 'pago' as "7_cobranca_paga_nunca_mexe" from charges where appointment_id = :'ap';
update appointments set price = 0, status = 'realizado' where id = :'ap';
select status = 'pago' as "8_paga_continua_paga" from charges where appointment_id = :'ap';
-- consulta sem valor não gera cobrança
insert into appointments (clinic_id, contact_id, starts_at, ends_at, status, procedure_text)
  values (:'c1', :'maria', now() - interval '5 hours', now() - interval '4 hours', 'agendado', 'Avaliação gratuita') returning id as ap2 \gset
update appointments set status = 'realizado' where id = :'ap2';
select count(*) = 0 as "9_sem_valor_nao_cobra" from charges where appointment_id = :'ap2';
-- valor zerado depois de realizado cancela a cobrança aberta
update appointments set price = 300 where id = :'ap2';
select status = 'aberto' as "10_colocou_valor_cria" from charges where appointment_id = :'ap2';
update appointments set price = null where id = :'ap2';
select status = 'cancelado' as "11_tirou_valor_cancela" from charges where appointment_id = :'ap2';
-- consulta já criada como realizada (automação) também cobra
insert into appointments (clinic_id, contact_id, starts_at, ends_at, status, procedure_id, price)
  values (:'c1', :'maria', now() - interval '26 hours', now() - interval '25 hours', 'realizado', (select id from procedures where clinic_id = :'c1' and name = 'Clareamento'), 650) returning id as ap3 \gset
select description like 'Clareamento (%' and amount = 650 as "12_insert_realizado_cobra_com_nome_do_procedimento" from charges where appointment_id = :'ap3';
reset role;
-- cobrança não pode apontar para consulta de outro paciente ou de outra clínica
insert into contacts (clinic_id, name, phone) values (:'c1', 'Outro', '5519900001234') returning id as outro \gset
do $$ begin
  begin insert into charges (clinic_id, contact_id, appointment_id, amount, due_date) values ((select id from clinics where name='Clínica Sorriso'), (select id from contacts where phone='5519900001234'), (select appointment_id from charges where appointment_id is not null and description like 'Clareamento (%' limit 1), 10, current_date); raise exception 'FALHOU';
  exception when others then if sqlerrm = 'FALHOU' then raise; end if; raise notice 'ok: cobrança de consulta de outro paciente recusada (%)', sqlerrm; end;
end $$;
delete from contacts where id = :'outro';
select 'COBRANCA OK' as r;
