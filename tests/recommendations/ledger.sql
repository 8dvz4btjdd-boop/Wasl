\set ON_ERROR_STOP on
-- Run only on the disposable Wasl test database. All synthetic rows roll back.
begin;
insert into auth.users(id, email, is_anonymous, aud, role) values
 ('11111111-0011-4000-8000-000000000001', 'knowledge-asker@example.invalid', true, 'authenticated', 'authenticated'),
 ('11111111-0011-4000-8000-000000000002', 'knowledge-daee@example.invalid', false, 'authenticated', 'authenticated'),
 ('11111111-0011-4000-8000-000000000003', 'knowledge-admin@example.invalid', false, 'authenticated', 'authenticated'),
 ('11111111-0011-4000-8000-000000000004', 'knowledge-other@example.invalid', false, 'authenticated', 'authenticated');
insert into public.organizations(id, name) values ('11111111-0011-4000-8000-000000000010', 'Synthetic ledger test');
insert into public.askers(user_id, org_id, pseudonym, return_code_hash) values
 ('11111111-0011-4000-8000-000000000001', '11111111-0011-4000-8000-000000000010', 'Synthetic', 'not-a-real-return-code');
insert into public.profiles(user_id, org_id, role, display_name) values
 ('11111111-0011-4000-8000-000000000002', '11111111-0011-4000-8000-000000000010', 'daee', 'Synthetic Daee'),
 ('11111111-0011-4000-8000-000000000003', '11111111-0011-4000-8000-000000000010', 'admin', 'Synthetic Admin'),
 ('11111111-0011-4000-8000-000000000004', '11111111-0011-4000-8000-000000000010', 'daee', 'Synthetic Other');
insert into public.conversations(id, org_id, asker_id, daee_id, status, assigned_at) values
 ('11111111-0011-4000-8000-000000000020', '11111111-0011-4000-8000-000000000010',
  '11111111-0011-4000-8000-000000000001', '11111111-0011-4000-8000-000000000002', 'waiting', now());

do $$
declare
  first jsonb;
  duplicate jsonb;
  cached jsonb;
  req uuid;
  finished boolean;
  caught boolean;
  private_role text;
begin
  if not (select relrowsecurity from pg_class where oid = 'public.recommendation_jobs'::regclass) then raise exception 'RLS is off'; end if;
  foreach private_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(private_role, 'public.recommendation_jobs', 'select') then raise exception '% can select jobs', private_role; end if;
    if has_function_privilege(private_role, 'public.recommendation_claim(uuid,text,uuid,text,text,text)', 'execute') then raise exception '% can claim jobs', private_role; end if;
    if has_function_privilege(private_role, 'public.recommendation_finish(uuid,jsonb,jsonb)', 'execute') then raise exception '% can finish jobs', private_role; end if;
  end loop;
  if not has_function_privilege('service_role', 'public.recommendation_claim(uuid,text,uuid,text,text,text)', 'execute') then raise exception 'service role cannot claim'; end if;
  first := public.recommendation_claim('11111111-0011-4000-8000-000000000020', 'daee', '11111111-0011-4000-8000-000000000002', 'question-1', 'automatic', 'ar');
  if first->>'state' <> 'start' then raise exception 'first request was not started'; end if;
  req := (first->>'requestId')::uuid;
  duplicate := public.recommendation_claim('11111111-0011-4000-8000-000000000020', 'daee', '11111111-0011-4000-8000-000000000002', 'question-1', 'automatic', 'ar');
  if duplicate->>'state' <> 'running' then raise exception 'duplicate engine allowed'; end if;
  duplicate := public.recommendation_claim('11111111-0011-4000-8000-000000000020', 'daee', '11111111-0011-4000-8000-000000000002', 'question-2', 'automatic', 'ar');
  if duplicate->>'state' <> 'running' then raise exception 'parallel different need allowed'; end if;
  select public.recommendation_finish(req, jsonb_build_object('requestId', req, 'contextVersion', 'question-1', 'status', 'partial', 'materials', '[]'::jsonb),
     '{"modelCalls":0,"modelSteps":0,"searches":0,"fetches":1,"inputTokens":0,"outputTokens":0,"cacheReadTokens":0,"cacheWriteTokens":0,"uncachedInputTokens":0,"costEstimateUsd":0,"elapsedMs":31,"pricingVerified":false,"providerReportedSearches":null,"voiceCostUsd":0,"forbiddenPrompt":"DO NOT STORE"}'::jsonb) into finished;
  if not finished then raise exception 'finish did not release lease'; end if;
  if (select fetches from public.recommendation_jobs where request_id = req) <> 1 then raise exception 'usage not preserved'; end if;
  if (select elapsed_ms from public.recommendation_jobs where request_id = req) <> 31 then raise exception 'latency not preserved'; end if;
  if exists(select 1 from information_schema.columns where table_name = 'recommendation_jobs' and column_name in ('prompt', 'question', 'query', 'messages', 'usage')) then raise exception 'private usage field present'; end if;
  cached := public.recommendation_claim('11111111-0011-4000-8000-000000000020', 'daee', '11111111-0011-4000-8000-000000000002', 'question-1', 'refresh', 'ar');
  if cached->>'state' <> 'cached' or cached->>'requestId' <> first->>'requestId' then raise exception 'refresh minted a budget'; end if;
  if (select count(*) from public.recommendation_jobs where conversation_id = '11111111-0011-4000-8000-000000000020') <> 1 then raise exception 'duplicate ledger row'; end if;
  duplicate := public.recommendation_claim('11111111-0011-4000-8000-000000000020', 'daee', '11111111-0011-4000-8000-000000000002', 'question-2', 'automatic', 'ar');
  if duplicate->>'state' <> 'cooldown' or (duplicate->>'retryAfterMs')::integer <= 0 then raise exception 'cooldown not enforced'; end if;
  update public.recommendation_jobs set created_at = now() - interval '21 seconds' where request_id = req;
  duplicate := public.recommendation_claim('11111111-0011-4000-8000-000000000020', 'daee', '11111111-0011-4000-8000-000000000002', 'question-2', 'automatic', 'ar');
  if duplicate->>'state' <> 'start' then raise exception 'latest queued need cannot run after cooldown'; end if;
  update public.recommendation_jobs set lease_until = now() - interval '1 second' where request_id = (duplicate->>'requestId')::uuid;
  cached := public.recommendation_claim('11111111-0011-4000-8000-000000000020', 'daee', '11111111-0011-4000-8000-000000000002', 'question-2', 'automatic', 'ar');
  if cached->>'state' <> 'cached' or cached->'result'->>'status' <> 'unavailable' then raise exception 'expired request minted retry budget'; end if;
  -- Privileged backend still cannot claim a job for an admin or unassigned actor.
  foreach private_role in array array['11111111-0011-4000-8000-000000000003', '11111111-0011-4000-8000-000000000004'] loop
    caught := false;
    begin
      perform public.recommendation_claim('11111111-0011-4000-8000-000000000020', 'daee', private_role::uuid, 'question-3', 'automatic', 'ar');
    exception when others then caught := true; end;
    if not caught then raise exception 'admin/unassigned actor was allowed'; end if;
  end loop;
  -- An actual authenticated-role read/function call is denied, not merely hidden by UI.
  execute 'set local role authenticated';
  caught := false;
  begin perform count(*) from public.recommendation_jobs; exception when insufficient_privilege then caught := true; end;
  if not caught then raise exception 'authenticated read succeeded'; end if;
  caught := false;
  begin perform public.recommendation_claim('11111111-0011-4000-8000-000000000020', 'daee', '11111111-0011-4000-8000-000000000002', 'question-3', 'automatic', 'ar'); exception when insufficient_privilege then caught := true; end;
  if not caught then raise exception 'authenticated RPC succeeded'; end if;
  execute 'reset role';
  raise notice 'PASS: recommendation ledger leases, idempotency, cooldown, expired retry, usage whitelist and enforced privileges';
end;
$$;
rollback;
