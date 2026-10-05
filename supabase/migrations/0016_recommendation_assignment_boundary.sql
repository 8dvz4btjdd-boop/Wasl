-- now() is transaction-start time, which can precede a waiting question. Assignments
-- use the actual server clock and serialize with receipt insertion on the same row.
-- No historical assignment or receipt is changed or backfilled.
create function public.conversations_set_assignment_clock()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.assigned_at := case when new.daee_id is null then null else clock_timestamp() end;
  elsif new.daee_id is distinct from old.daee_id then
    new.assigned_at := case when new.daee_id is null then null else clock_timestamp() end;
  else
    -- Changing only a timestamp cannot move existing messages across an assignment.
    new.assigned_at := old.assigned_at;
  end if;
  return new;
end;
$$;
create trigger conversations_assignment_clock before insert or update of daee_id, assigned_at on public.conversations
  for each row execute function public.conversations_set_assignment_clock();
revoke all on function public.conversations_set_assignment_clock() from public, anon, authenticated;

create or replace function public.messages_set_trusted_receipt()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    -- The existing sender-role trigger and INSERT RLS still validate participation.
    -- Serialize receipt with assignment/end transactions; waiting on an uncommitted
    -- transfer yields a receipt only after the new assignment becomes visible.
    perform 1 from public.conversations where id = new.conversation_id for update;
    if not found then raise exception 'conversation not found'; end if;
    new.received_at := clock_timestamp();
  elsif new.received_at is distinct from old.received_at then
    raise exception 'message receipt is immutable';
  end if;
  return new;
end;
$$;
revoke all on function public.messages_set_trusted_receipt() from public, anon, authenticated;
