\set ON_ERROR_STOP 1
grant all on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a', 'ana@a.com', '{"full_name":"Ana"}'),
 ('00000000-0000-0000-0000-00000000000b', 'beto@b.com', '{"full_name":"Beto"}'),
 ('00000000-0000-0000-0000-00000000000c', 'caio@a.com', '{"full_name":"Caio"}');
select count(*) as perfis_criados from profiles;

-- Ana cria clínica A
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
select create_clinic('Clínica Sorriso', 'odonto', '5519999990000', 'Piracicaba', 'SP') as a \gset
select count(*) as etapas_a from stages; select count(*) as proc_a from procedures;
insert into contacts (clinic_id, name, phone) values (:'a', 'Maria', '5519988887777') returning id as ca \gset
insert into deals (clinic_id, contact_id, stage_id, title, value) select :'a', :'ca', id, 'Implante', 3500 from stages where clinic_id = :'a' and position = 0 returning id as da \gset
update deals set stage_id = (select id from stages where clinic_id = :'a' and kind = 'won') where id = :'da';
select type, body from activities where deal_id = :'da';
select closed_at is not null as fechado from deals where id = :'da';
-- tentar mudar status da assinatura (deve falhar)
do $$ begin
  begin update clinics set status = 'active'; raise exception 'FALHOU: status alterado';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; raise notice 'ok: status protegido (%)', sqlerrm; end;
end $$;
insert into invites (clinic_id, email, role) values (:'a', 'caio@a.com', 'staff') returning token as tk \gset

-- Beto cria clínica B e não enxerga A
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false);
select create_clinic('Estética Bela', 'estetica') as b \gset
select count(*) as beto_ve_contatos_de_a from contacts where clinic_id = :'a';
select count(*) as beto_ve_clinicas from clinics;
do $$ begin
  begin insert into contacts (clinic_id, name) values ((select id from clinics where name='Clínica Sorriso' limit 1), 'invasor'); raise exception 'FALHOU';
  exception when others then if sqlerrm = 'FALHOU' then raise; end if; raise notice 'ok: insert em outra clínica bloqueado (%)', sqlerrm; end;
end $$;
-- referência cruzada: deal da B apontando contato da A
do $$ declare cb uuid; begin
  select id into cb from clinics where name = 'Estética Bela';
  begin insert into deals (clinic_id, contact_id, stage_id, title) values (cb, (select id from contacts limit 1), (select id from stages where clinic_id = cb limit 1), 'x'); raise exception 'FALHOU';
  exception when others then if sqlerrm = 'FALHOU' then raise; end if; raise notice 'ok: referência cruzada bloqueada (%)', sqlerrm; end;
end $$;
-- storage
insert into storage.objects (bucket_id, name) values ('clinic-files', :'b' || '/fotos/x.png');
do $$ begin
  begin insert into storage.objects (bucket_id, name) values ('clinic-files', (select id::text from clinics where name='Clínica Sorriso') || '/x.png'); raise exception 'FALHOU';
  exception when others then if sqlerrm = 'FALHOU' then raise; end if; raise notice 'ok: storage de outra clínica bloqueado'; end;
end $$;

-- Caio aceita convite e entra na A como staff
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select accept_invite(:'tk') = :'a'::uuid as convite_ok;
select count(*) as caio_ve_contatos from contacts;
do $$ begin
  begin insert into stages (clinic_id, name) values ((select id from clinics limit 1), 'x'); raise exception 'FALHOU';
  exception when others then if sqlerrm = 'FALHOU' then raise; end if; raise notice 'ok: staff não altera funil'; end;
end $$;
select count(*) as caio_ve_perfis from profiles;

-- clínica vencida: leitura sim, escrita não
reset role;
update clinics set status = 'blocked' where id = :'a';
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
select count(*) as ana_le_bloqueada from contacts;
do $$ begin
  begin insert into contacts (clinic_id, name) values ((select id from clinics limit 1), 'novo'); raise exception 'FALHOU';
  exception when others then if sqlerrm = 'FALHOU' then raise; end if; raise notice 'ok: clínica bloqueada não grava'; end;
end $$;
-- pedido de automação: valores forçados
reset role; update clinics set status = 'active' where id = :'a';
set role authenticated;
insert into automation_requests (clinic_id, flows, setup_cents, monthly_cents, status) values (:'a', '{C1}', 1, 1, 'ativo') returning status, setup_cents, monthly_cents;
reset role;
select 'TUDO OK' as resultado;
