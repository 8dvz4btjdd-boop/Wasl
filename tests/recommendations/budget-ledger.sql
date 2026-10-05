\set ON_ERROR_STOP on
-- Disposable local Wasl database only. Synthetic budget counters/rows all roll back.
begin;
insert into auth.users(id, email, is_anonymous, aud, role) values
 ('22222222-0012-4000-8000-000000000001', 'budget-a@example.invalid', true, 'authenticated', 'authenticated'),
 ('22222222-0012-4000-8000-000000000002', 'budget-b@example.invalid', true, 'authenticated', 'authenticated');
insert into public.organizations(id, name) values
 ('22222222-0012-4000-8000-000000000010', 'Synthetic budget organization A'),
 ('22222222-0012-4000-8000-000000000011', 'Synthetic budget organization B');
insert into public.askers(user_id, org_id, pseudonym, return_code_hash) values
 ('22222222-0012-4000-8000-000000000001', '22222222-0012-4000-8000-000000000010', 'Synthetic A', 'not-a-code'),
 ('22222222-0012-4000-8000-000000000002', '22222222-0012-4000-8000-000000000011', 'Synthetic B', 'not-a-code');
insert into public.conversations(id, org_id, asker_id, status) values
 ('22222222-0012-4000-8000-000000000020', '22222222-0012-4000-8000-000000000010', '22222222-0012-4000-8000-000000000001', 'waiting'),
 ('22222222-0012-4000-8000-000000000021', '22222222-0012-4000-8000-000000000011', '22222222-0012-4000-8000-000000000002', 'waiting');
insert into public.recommendation_jobs(request_id, conversation_id, org_id, actor_id, audience, context_version, mode, locale) values
 ('22222222-0012-4000-8000-000000000030', '22222222-0012-4000-8000-000000000020', '22222222-0012-4000-8000-000000000010', '22222222-0012-4000-8000-000000000001', 'asker', 'synthetic-quick', 'automatic', 'ar'),
 ('22222222-0012-4000-8000-000000000031', '22222222-0012-4000-8000-000000000020', '22222222-0012-4000-8000-000000000010', '22222222-0012-4000-8000-000000000001', 'asker', 'synthetic-expand', 'expand', 'ar'),
 ('22222222-0012-4000-8000-000000000032', '22222222-0012-4000-8000-000000000021', '22222222-0012-4000-8000-000000000011', '22222222-0012-4000-8000-000000000002', 'asker', 'synthetic-other-org', 'automatic', 'ar');
-- This artificial 4.50 USD starting counter is a boundary fixture, not measured spend.
insert into public.recommendation_budget_authorizations(authorization_id, reserved_usd)
 values('contextual-test-2026-10-05', 4.5)
 on conflict(authorization_id) do update set reserved_usd = 4.5;

do $$
declare
  answer boolean;
  caught boolean;
  role_name text;
  initial_count bigint;
begin
  select count(*) into initial_count from public.recommendation_budget_reservations;
  if public.recommendation_reserve_budget('22222222-0012-4000-8000-000000000030', '22222222-0012-4000-8000-000000000011', 0.15, 5) then raise exception 'wrong org reservation allowed'; end if;
  if public.recommendation_reserve_budget('22222222-0012-4000-8000-000000000030', '22222222-0012-4000-8000-000000000010', 0.16, 5) then raise exception 'quick hardcap was bypassed'; end if;
  if public.recommendation_reserve_budget('22222222-0012-4000-8000-000000000031', '22222222-0012-4000-8000-000000000010', 0.36, 5) then raise exception 'expand hardcap was bypassed'; end if;
  answer := public.recommendation_reserve_budget('22222222-0012-4000-8000-000000000030', '22222222-0012-4000-8000-000000000010', 0.15, 5);
  if not answer then raise exception 'valid quick reservation denied'; end if;
  if not public.recommendation_reserve_budget('22222222-0012-4000-8000-000000000030', '22222222-0012-4000-8000-000000000010', 0.15, 5) then raise exception 'idempotent reservation denied'; end if;
  if (select reserved_usd from public.recommendation_budget_authorizations where authorization_id = 'contextual-test-2026-10-05') <> 4.65 then raise exception 'duplicate reservation charged twice'; end if;
  if public.recommendation_reserve_budget('22222222-0012-4000-8000-000000000030', '22222222-0012-4000-8000-000000000010', 0.14, 5) then raise exception 'immutable reservation amount changed'; end if;
  if not public.recommendation_reserve_budget('22222222-0012-4000-8000-000000000031', '22222222-0012-4000-8000-000000000010', 0.35, 5) then raise exception 'valid expansion reservation denied'; end if;
  if (select reserved_usd from public.recommendation_budget_authorizations where authorization_id = 'contextual-test-2026-10-05') <> 5 then raise exception 'global counter incorrect'; end if;
  if public.recommendation_reserve_budget('22222222-0012-4000-8000-000000000032', '22222222-0012-4000-8000-000000000011', 0.15, 100) then raise exception 'other org / larger caller limit reset total budget'; end if;
  update public.recommendation_budget_reservations set reserved_on_utc = current_date - 1 where request_id = '22222222-0012-4000-8000-000000000030';
  if public.recommendation_reserve_budget('22222222-0012-4000-8000-000000000032', '22222222-0012-4000-8000-000000000011', 0.15, 5) then raise exception 'midnight reset global budget'; end if;
  delete from public.recommendation_jobs where request_id = '22222222-0012-4000-8000-000000000030';
  if not exists(select 1 from public.recommendation_budget_reservations where request_id = '22222222-0012-4000-8000-000000000030') then raise exception 'job deletion erased spend reservation'; end if;
  if (select count(*) from public.recommendation_budget_reservations) <> initial_count + 2 then raise exception 'reservation row count incorrect'; end if;
  if public.recommendation_reserve_budget('22222222-0012-4000-8000-000000000032', '22222222-0012-4000-8000-000000000011', 0.15, 5) then raise exception 'deleting conversation/job reset budget'; end if;
  foreach role_name in array array['anon', 'authenticated'] loop
    if has_table_privilege(role_name, 'public.recommendation_budget_reservations', 'select') or has_table_privilege(role_name, 'public.recommendation_budget_authorizations', 'select') then raise exception '% can read budget', role_name; end if;
    if has_function_privilege(role_name, 'public.recommendation_reserve_budget(uuid,uuid,numeric,numeric)', 'execute') then raise exception '% can reserve', role_name; end if;
  end loop;
  execute 'set local role authenticated';
  caught := false;
  begin perform count(*) from public.recommendation_budget_reservations; exception when insufficient_privilege then caught := true; end;
  if not caught then raise exception 'authenticated budget read succeeded'; end if;
  caught := false;
  begin perform public.recommendation_reserve_budget('22222222-0012-4000-8000-000000000032', '22222222-0012-4000-8000-000000000011', 0.15, 5); exception when insufficient_privilege then caught := true; end;
  if not caught then raise exception 'authenticated reserve succeeded'; end if;
  execute 'reset role';
  raise notice 'PASS: global USD5 cap, .15/.35 hardcaps, cross-org limit, immutable retry, no midnight/deletion reset, enforced private RPC/table privileges';
end;
$$;
rollback;
