\set ON_ERROR_STOP 1
-- Roda depois de 0005, numa base com a Clínica Sorriso (dono e1) criada
grant all on all tables in schema public to authenticated, service_role;
select id as c1 from clinics where name = 'Clínica Sorriso' \gset
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000f2', 'equipe@s.com', '{"full_name":"Equipe"}') on conflict do nothing;
insert into memberships (clinic_id, user_id, role) values (:'c1', '00000000-0000-0000-0000-0000000000f2', 'staff') on conflict do nothing;
insert into clinics (name, kind) values ('Outra Clínica', 'estetica') on conflict do nothing;
select id as c2 from clinics where name = 'Outra Clínica' limit 1 \gset
insert into procedures (clinic_id, name, duration_min) values (:'c2', 'Peeling', 40) returning id as p2 \gset

-- Equipe (staff) não altera o horário
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000f2',false);
do $$ begin
  begin insert into business_hours (clinic_id, weekday, start_time, end_time) values ((select id from clinics where name='Clínica Sorriso'), 1, '08:00', '12:00'); raise exception 'FALHOU';
  exception when others then if sqlerrm = 'FALHOU' then raise; end if; raise notice 'ok: equipe não altera horário (%)', sqlerrm; end;
end $$;
select count(*) as equipe_ve_horarios from business_hours;

-- Dono altera
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000e1',false);
insert into business_hours (clinic_id, weekday, start_time, end_time) values (:'c1', 1, '08:00', '12:00'), (:'c1', 1, '13:30', '18:00');
do $$ begin
  begin insert into business_hours (clinic_id, weekday, start_time, end_time) values ((select id from clinics where name='Clínica Sorriso'), 2, '12:00', '08:00'); raise exception 'FALHOU';
  exception when others then if sqlerrm = 'FALHOU' then raise; end if; raise notice 'ok: fim antes do início recusado'; end;
end $$;
-- Dono não grava horário em outra clínica
do $$ begin
  begin insert into business_hours (clinic_id, weekday, start_time, end_time) values ((select id from clinics where name='Outra Clínica'), 1, '08:00', '12:00'); raise exception 'FALHOU';
  exception when others then if sqlerrm = 'FALHOU' then raise; end if; raise notice 'ok: outra clínica bloqueada'; end;
end $$;
-- Procedimento do WhatsApp de outra clínica é recusado
reset role;
do $$ begin
  begin update clinics set slot_procedure_id = (select id from procedures where name='Peeling') where name = 'Clínica Sorriso'; raise exception 'FALHOU';
  exception when others then if sqlerrm = 'FALHOU' then raise; end if; raise notice 'ok: procedimento de outra clínica recusado (%)', sqlerrm; end;
end $$;
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000e1',false);
update clinics set slot_procedure_id = (select id from procedures where clinic_id = :'c1' and name = 'Avaliação'), slot_capacity = 1 where id = :'c1';
select slot_capacity, slot_procedure_id is not null as tem_proc from clinics where id = :'c1';
-- preço negativo recusado
do $$ begin
  begin update appointments set price = -1 where clinic_id = (select id from clinics where name='Clínica Sorriso'); raise exception 'FALHOU';
  exception when others then if sqlerrm = 'FALHOU' then raise; end if; raise notice 'ok: preço negativo recusado'; end;
end $$;
reset role;
delete from business_hours where clinic_id = :'c1';
delete from procedures where clinic_id = :'c2';
delete from clinics where id = :'c2';
delete from memberships where user_id = '00000000-0000-0000-0000-0000000000f2';
select 'HORARIOS OK' as r;
