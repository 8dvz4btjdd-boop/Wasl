-- Manual conversation path: tighter RLS, routing, presence, queue, ending, and
-- message triggers that keep sender roles honest and log KPI events.

-- ---------------------------------------------------------------------------
-- RLS fixes
-- ---------------------------------------------------------------------------

-- Staff may change only their own presence; role, org and the rest are not client-writable.
revoke update on profiles from anon, authenticated;
grant update (status) on profiles to authenticated;

-- Conversations: askers create and read their own; daee read only those assigned to them.
-- Assignment, status changes and ending go through the functions below.
drop policy conv_asker on conversations;
drop policy conv_daee on conversations;
create policy conv_asker_read on conversations for select to authenticated using (conversations.asker_id = auth.uid());
create policy conv_asker_insert on conversations for insert to authenticated with check (
  conversations.asker_id = auth.uid()
  and conversations.daee_id is null
  and conversations.status = 'waiting'
  and exists (select 1 from askers a where a.user_id = auth.uid() and a.org_id = conversations.org_id)
);
create policy conv_daee_read on conversations for select to authenticated using (conversations.daee_id = auth.uid());

alter table conversations add column assigned_at timestamptz;
create index on conversations (org_id, status, created_at) where daee_id is null;
create index on conversations (daee_id, status);

-- Messages: participants of a conversation that hasn't ended. sender_role is set by trigger.
drop policy msg_insert on messages;
create policy msg_insert on messages for insert to authenticated with check (
  messages.sender_id = auth.uid()
  and exists (
    select 1 from conversations c
    where c.id = messages.conversation_id
      and c.status <> 'ended'
      and (c.asker_id = auth.uid() or c.daee_id = auth.uid())
  )
);

-- ---------------------------------------------------------------------------
-- Helpers (internal, not callable by clients)
-- ---------------------------------------------------------------------------

create or replace function open_conversation_count(d uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from conversations where daee_id = d and status in ('waiting', 'active')
$$;

-- Assigns a waiting conversation to a daee and records the event and notification.
create or replace function assign_conversation(conv uuid, d uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  c record;
begin
  update conversations set daee_id = d, assigned_at = now()
   where id = conv and daee_id is null and status = 'waiting'
  returning org_id, topic, asker_id into c;
  if not found then return; end if;

  insert into events (org_id, type, conversation_id, actor_role, meta)
  select c.org_id, 'routed', conv, 'system',
         jsonb_build_object('daee_id', d, 'topic_match', coalesce(c.topic = any(p.topics), false))
    from profiles p where p.user_id = d;

  insert into notifications (recipient_id, type, payload)
  select d, 'conversation_routed',
         jsonb_build_object('conversation_id', conv, 'pseudonym', a.pseudonym, 'language', a.language)
    from askers a where a.user_id = c.asker_id;
end;
$$;

-- Fills a daee's free capacity with matching waiting conversations, oldest first.
create or replace function assign_waiting_for(d uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  p record;
  conv uuid;
  assigned int := 0;
begin
  select * into p from profiles where user_id = d and role = 'daee' and status = 'available' for update;
  if not found then return 0; end if;

  loop
    exit when open_conversation_count(d) >= p.capacity;
    select cv.id into conv
      from conversations cv
      join askers a on a.user_id = cv.asker_id
     where cv.org_id = p.org_id and cv.status = 'waiting' and cv.daee_id is null
       and a.language = any(p.languages)
     order by cv.created_at
     limit 1
     for update of cv skip locked;
    exit when conv is null;
    perform assign_conversation(conv, d);
    assigned := assigned + 1;
  end loop;
  return assigned;
end;
$$;

revoke execute on function open_conversation_count(uuid) from public, anon, authenticated;
revoke execute on function assign_conversation(uuid, uuid) from public, anon, authenticated;
revoke execute on function assign_waiting_for(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Client-callable functions (each checks the caller)
-- ---------------------------------------------------------------------------

-- Routes a waiting conversation: available daee, speaks the asker's language, under
-- capacity; topic match first, then lightest load, then longest since last assignment.
-- Returns the daee id, or null when nobody is free (the conversation stays waiting).
create or replace function route_conversation(conv uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  c record;
  d uuid;
  cap int;
begin
  select cv.id, cv.org_id, cv.asker_id, cv.daee_id, cv.status, cv.topic, a.language
    into c
    from conversations cv join askers a on a.user_id = cv.asker_id
   where cv.id = conv
   for update of cv;
  if not found then raise exception 'conversation not found'; end if;
  if auth.uid() is distinct from c.asker_id and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'not allowed';
  end if;
  if c.daee_id is not null or c.status <> 'waiting' then return c.daee_id; end if;

  select p.user_id, p.capacity into d, cap
    from profiles p
   where p.org_id = c.org_id and p.role = 'daee' and p.status = 'available'
     and c.language = any(p.languages)
     and open_conversation_count(p.user_id) < p.capacity
   order by coalesce(c.topic = any(p.topics), false) desc,
            open_conversation_count(p.user_id),
            (select max(x.assigned_at) from conversations x where x.daee_id = p.user_id) nulls first
   limit 1
   for update of p;
  if d is null then return null; end if;
  -- Re-check after taking the lock: a concurrent routing may have used the last slot.
  if open_conversation_count(d) >= cap then return null; end if;

  perform assign_conversation(conv, d);
  return d;
end;
$$;

-- Sets the caller's presence. Becoming available pulls in matching waiting conversations.
create or replace function set_presence(p_status presence) returns int
language plpgsql security definer set search_path = public as $$
begin
  update profiles set status = p_status where user_id = auth.uid() and role = 'daee';
  if not found then raise exception 'not a daee'; end if;
  if p_status = 'available' then return assign_waiting_for(auth.uid()); end if;
  return 0;
end;
$$;

-- Position among unassigned waiting conversations in the same language (1 = next).
-- 0 once assigned or no longer waiting; null if the caller doesn't own it.
create or replace function queue_position(conv uuid) returns int
language plpgsql stable security definer set search_path = public as $$
declare
  c record;
begin
  select cv.org_id, cv.daee_id, cv.status, cv.created_at, a.language
    into c
    from conversations cv join askers a on a.user_id = cv.asker_id
   where cv.id = conv and cv.asker_id = auth.uid();
  if not found then return null; end if;
  if c.daee_id is not null or c.status <> 'waiting' then return 0; end if;
  return 1 + (
    select count(*)::int
      from conversations x join askers xa on xa.user_id = x.asker_id
     where x.org_id = c.org_id and x.status = 'waiting' and x.daee_id is null
       and xa.language = c.language and x.created_at < c.created_at
  );
end;
$$;

-- Ends a conversation assigned to the caller, then offers freed capacity to the queue.
create or replace function end_conversation(conv uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update conversations set status = 'ended', ended_at = now()
   where id = conv and daee_id = auth.uid() and status <> 'ended';
  if not found then raise exception 'not allowed'; end if;
  perform assign_waiting_for(auth.uid());
end;
$$;

revoke execute on function route_conversation(uuid) from public, anon;
revoke execute on function set_presence(presence) from public, anon;
revoke execute on function queue_position(uuid) from public, anon;
revoke execute on function end_conversation(uuid) from public, anon;
grant execute on function route_conversation(uuid) to authenticated, service_role;
grant execute on function set_presence(presence) to authenticated;
grant execute on function queue_position(uuid) to authenticated;
grant execute on function end_conversation(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Message triggers
-- ---------------------------------------------------------------------------

-- sender_role comes from the conversation, never from the client.
create or replace function messages_set_sender_role() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  c record;
begin
  select asker_id, daee_id, status into c from conversations where id = new.conversation_id;
  if not found then raise exception 'conversation not found'; end if;
  if c.status = 'ended' then raise exception 'conversation has ended'; end if;
  if new.sender_id = c.asker_id then
    new.sender_role := 'asker';
  elsif new.sender_id = c.daee_id then
    new.sender_role := 'daee';
  else
    raise exception 'sender is not a participant';
  end if;
  return new;
end;
$$;

create trigger messages_before_insert before insert on messages
  for each row execute function messages_set_sender_role();

-- KPI events on daee messages: the first starts the conversation; the first longer than
-- 40 characters is the first substantive reply.
create or replace function messages_log_daee_events() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
begin
  if new.sender_role <> 'daee' then return null; end if;

  update conversations set status = 'active', started_at = now()
   where id = new.conversation_id and status = 'waiting'
  returning org_id into v_org;
  if found then
    insert into events (org_id, type, conversation_id, actor_role)
    values (v_org, 'conversation_started', new.conversation_id, 'daee');
  end if;

  if char_length(btrim(new.body)) > 40 and not exists (
    select 1 from events where conversation_id = new.conversation_id and type = 'first_substantive_reply'
  ) then
    insert into events (org_id, type, conversation_id, actor_role)
    select org_id, 'first_substantive_reply', new.conversation_id, 'daee'
      from conversations where id = new.conversation_id;
  end if;
  return null;
end;
$$;

create trigger messages_after_insert after insert on messages
  for each row execute function messages_log_daee_events();

revoke execute on function messages_set_sender_role() from public, anon, authenticated;
revoke execute on function messages_log_daee_events() from public, anon, authenticated;
