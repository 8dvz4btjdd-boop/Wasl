\set ON_ERROR_STOP on
-- Labelled disposable local DB only. Prove clock_timestamp does not use transaction start.
begin;
insert into auth.users(id, email, is_anonymous, aud, role) values
 ('66666666-0014-4000-8000-000000000001', 'clock-asker@example.invalid', true, 'authenticated', 'authenticated'),
 ('66666666-0014-4000-8000-000000000002', 'clock-daee@example.invalid', false, 'authenticated', 'authenticated');
insert into public.organizations(id, name) values('66666666-0014-4000-8000-000000000010', 'Synthetic assignment clock test');
insert into public.askers(user_id, org_id, pseudonym, return_code_hash) values
 ('66666666-0014-4000-8000-000000000001', '66666666-0014-4000-8000-000000000010', 'Synthetic clock', 'not-a-code');
insert into public.profiles(user_id, org_id, role, display_name) values
 ('66666666-0014-4000-8000-000000000002', '66666666-0014-4000-8000-000000000010', 'daee', 'Synthetic clock daee');
insert into public.conversations(id, org_id, asker_id, status, assigned_at) values
 ('66666666-0014-4000-8000-000000000020', '66666666-0014-4000-8000-000000000010', '66666666-0014-4000-8000-000000000001', 'waiting', '2099-01-01');
insert into public.messages(id, conversation_id, sender_id, sender_role, body, created_at) values
 ('66666666-0014-4000-8000-000000000030', '66666666-0014-4000-8000-000000000020', '66666666-0014-4000-8000-000000000001', 'asker', 'SYNTHETIC prior segment', '2099-01-01');
-- Existing assignment RPCs pass now(); the trigger must replace this old transaction time.
update public.conversations set daee_id = '66666666-0014-4000-8000-000000000002', assigned_at = now()
 where id = '66666666-0014-4000-8000-000000000020';
do $$
declare assigned timestamptz;
begin
  select assigned_at into assigned from public.conversations where id = '66666666-0014-4000-8000-000000000020';
  if assigned <= now() then raise exception 'assignment still uses transaction-start time'; end if;
  if exists(select 1 from public.messages where id = '66666666-0014-4000-8000-000000000030' and received_at >= assigned) then raise exception 'old message crossed clock cut'; end if;
  update public.conversations set assigned_at = '2000-01-01' where id = '66666666-0014-4000-8000-000000000020';
  if (select assigned_at from public.conversations where id = '66666666-0014-4000-8000-000000000020') is distinct from assigned then raise exception 'timestamp-only update moved boundary'; end if;
  raise notice 'PASS: assignment uses trusted current clock, excludes old receipt in same transaction, ignores timestamp-only mutation';
end;
$$;
rollback;
