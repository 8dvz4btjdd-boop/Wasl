\set ON_ERROR_STOP on
-- Disposable labelled local Wasl DB only. No historical receipt is backfilled.
-- Direct authenticated inserts carry forged dates; synthetic rows all roll back.
begin;
insert into auth.users(id, email, is_anonymous, aud, role) values
 ('55555555-0013-4000-8000-000000000001', 'receipt-asker@example.invalid', true, 'authenticated', 'authenticated'),
 ('55555555-0013-4000-8000-000000000002', 'receipt-daee@example.invalid', false, 'authenticated', 'authenticated');
insert into public.organizations(id, name) values('55555555-0013-4000-8000-000000000010', 'Synthetic trusted receipt test');
insert into public.askers(user_id, org_id, pseudonym, return_code_hash) values
 ('55555555-0013-4000-8000-000000000001', '55555555-0013-4000-8000-000000000010', 'Synthetic receipt', 'not-a-code');
insert into public.profiles(user_id, org_id, role, display_name) values
 ('55555555-0013-4000-8000-000000000002', '55555555-0013-4000-8000-000000000010', 'daee', 'Synthetic receipt daee');
insert into public.conversations(id, org_id, asker_id, status) values
 ('55555555-0013-4000-8000-000000000020', '55555555-0013-4000-8000-000000000010', '55555555-0013-4000-8000-000000000001', 'waiting');
set local role authenticated;
set local request.jwt.claim.sub = '55555555-0013-4000-8000-000000000001';
insert into public.messages(id, conversation_id, sender_id, sender_role, body, created_at, received_at) values
 ('55555555-0013-4000-8000-000000000030', '55555555-0013-4000-8000-000000000020', '55555555-0013-4000-8000-000000000001', 'asker', 'SYNTHETIC old segment', '2099-01-01', '2099-01-01');
reset role;
update public.conversations set daee_id = '55555555-0013-4000-8000-000000000002', assigned_at = clock_timestamp()
 where id = '55555555-0013-4000-8000-000000000020';
set local role authenticated;
insert into public.messages(id, conversation_id, sender_id, sender_role, body, created_at, received_at) values
 ('55555555-0013-4000-8000-000000000031', '55555555-0013-4000-8000-000000000020', '55555555-0013-4000-8000-000000000001', 'asker', 'SYNTHETIC new segment', '2000-01-01', '2000-01-01');
do $$
declare changed integer;
begin
  if not exists(select 1 from public.messages where id = '55555555-0013-4000-8000-000000000030' and received_at between clock_timestamp() - interval '1 minute' and clock_timestamp()) then raise exception 'future client receipt accepted'; end if;
  if not exists(select 1 from public.messages where id = '55555555-0013-4000-8000-000000000031' and received_at between clock_timestamp() - interval '1 minute' and clock_timestamp()) then raise exception 'past client receipt accepted'; end if;
  update public.messages set received_at = '2099-01-01' where id = '55555555-0013-4000-8000-000000000030';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'authenticated updated its receipt'; end if;
end;
$$;
reset role;
-- Even a privileged maintenance update cannot move an existing receipt into a segment.
do $$
declare caught boolean := false;
begin
  begin
    update public.messages set received_at = '2099-01-01' where id = '55555555-0013-4000-8000-000000000030';
  exception when raise_exception then
    if sqlerrm = 'message receipt is immutable' then caught := true; else raise; end if;
  end;
  if not caught then raise exception 'receipt mutation did not fail'; end if;
end;
$$;
set local role authenticated;
set local request.jwt.claim.sub = '55555555-0013-4000-8000-000000000002';
do $$
declare visible uuid[];
begin
  select array_agg(m.id order by m.received_at) into visible from public.messages m join public.conversations c on c.id = m.conversation_id
    where c.id = '55555555-0013-4000-8000-000000000020' and m.received_at >= c.assigned_at;
  if visible is distinct from array['55555555-0013-4000-8000-000000000031'::uuid] then raise exception 'forged created_at crossed current segment'; end if;
  raise notice 'PASS: authenticated forged past/future receipt overridden, immutable update, RLS current participant, trusted segment cut';
end;
$$;
reset role;
rollback;
