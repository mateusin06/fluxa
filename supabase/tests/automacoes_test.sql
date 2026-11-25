\set ON_ERROR_STOP 1
grant all on all tables in schema public to authenticated, service_role;
select id as c1 from clinics where name = 'Clínica Sorriso' \gset
select sheet_row from contacts where clinic_id = :'c1';
set role service_role;
insert into appointments (clinic_id, starts_at, ends_at, status) values (:'c1', now() + interval '1 day', now() + interval '1 day 1 hour', 'livre') returning sheet_row as livre_row;
insert into contacts (clinic_id, name, phone) values (:'c1', 'Novo', '5519900000001') returning sheet_row as contato_row;
insert into sheet_rows (clinic_id, tab, data) values (:'c1', 'Log', '{}'), (:'c1', 'Log', '{}') returning tab, sheet_row;
do $$ begin
  begin insert into appointments (clinic_id, starts_at, ends_at, status) values ((select id from clinics where name='Clínica Sorriso'), now(), now() + interval '1 hour', 'agendado'); raise exception 'FALHOU';
  exception when others then if sqlerrm = 'FALHOU' then raise; end if; raise notice 'ok: agendado sem paciente bloqueado'; end;
end $$;
reset role;
select 'AUTOMACOES OK' as r;
