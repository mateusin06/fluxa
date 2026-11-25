\set ON_ERROR_STOP 1
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000d1', 'dono@clinica.com');
set role service_role;
select provision_clinic('00000000-0000-0000-0000-0000000000d1', 'Odonto Vida', 'odonto', '5519999990000', 'Piracicaba', 'SP', 'sistema_automacoes', 14) as c1 \gset
select provision_clinic('00000000-0000-0000-0000-0000000000d1', 'odonto vida', 'odonto', null, null, null) = :'c1'::uuid as idempotente;
update clinics set status = 'active' where id = :'c1';
select status, plan, source, (trial_ends_at > now() + interval '13 days') as teste_14d from clinics where id = :'c1';
select ai_usage_this_month(:'c1', 'text') as uso;
reset role;
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d1',false);
do $$ begin
  begin perform provision_clinic('00000000-0000-0000-0000-0000000000d1', 'X', 'odonto', null, null, null); raise exception 'FALHOU';
  exception when others then if sqlerrm = 'FALHOU' then raise; end if; raise notice 'ok: authenticated não executa provision_clinic (%)', sqlerrm; end;
end $$;
select count(*) as dono_ve_sua_clinica from clinics;
reset role;
select 'PROVISION OK' as r;
