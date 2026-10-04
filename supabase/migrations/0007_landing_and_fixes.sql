-- Seven languages, public availability counts for the landing page, a way out of a
-- card-first transfer whose target left, and conversation_started logged once.

-- ---------------------------------------------------------------------------
-- Languages
-- ---------------------------------------------------------------------------

alter table organizations alter column languages set default '{ar,en,fr,es,ur,id,tl}';

-- ---------------------------------------------------------------------------
-- Landing page: how many daee are available now in a language. Counts only, no names.
-- Callable without signing in (the landing page is public).
-- ---------------------------------------------------------------------------

create or replace function public_availability(p_language text) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int
    from profiles p
   where p.org_id = (select id from organizations order by created_at limit 1)
     and p.role = 'daee'
     and p.status = 'available'
     and p_language = any(p.languages)
     and is_active_staff(p.user_id)
$$;
revoke execute on function public_availability(text) from public;
grant execute on function public_availability(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Card-first transfers whose target became unavailable
-- ---------------------------------------------------------------------------

alter table transfers add column requeued_at timestamptz;

-- For the conversation's asker: can the pending transfer still go ahead?
create or replace function transfer_target_available(t uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  tr record;
begin
  select tr0.to_daee, cv.asker_id, a.language
    into tr
    from transfers tr0
    join conversations cv on cv.id = tr0.conversation_id
    join askers a on a.user_id = cv.asker_id
   where tr0.id = t and tr0.status = 'pending';
  if not found then return false; end if;
  if tr.asker_id is distinct from auth.uid() then raise exception 'not allowed'; end if;
  return exists (
    select 1 from profiles p
     where p.user_id = tr.to_daee and p.role = 'daee' and p.status = 'available' and is_active_staff(p.user_id)
       and tr.language = any(p.languages) and open_conversation_count(p.user_id) < p.capacity
  );
end;
$$;

-- For the conversation's asker: drop a pending transfer whose target left and return the
-- conversation to the queue. Another available daee who speaks the language (not the one
-- who asked to hand it over) takes it if free; otherwise it waits.
create or replace function requeue_transfer(t uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  tr record;
  d uuid;
begin
  select tr0.id, tr0.conversation_id, tr0.from_daee, cv.asker_id, cv.org_id, a.language
    into tr
    from transfers tr0
    join conversations cv on cv.id = tr0.conversation_id
    join askers a on a.user_id = cv.asker_id
   where tr0.id = t and tr0.status = 'pending'
   for update of tr0;
  if not found then raise exception 'not pending'; end if;
  if tr.asker_id is distinct from auth.uid() then raise exception 'not allowed'; end if;

  update transfers set status = 'declined', requeued_at = now() where id = t;
  update conversations set daee_id = null, assigned_at = null, status = 'waiting', preferred_daee_id = null
   where id = tr.conversation_id;

  select p.user_id into d
    from profiles p
   where p.org_id = tr.org_id and p.role = 'daee' and p.status = 'available'
     and p.user_id <> tr.from_daee and is_active_staff(p.user_id)
     and tr.language = any(p.languages) and open_conversation_count(p.user_id) < p.capacity
   order by open_conversation_count(p.user_id)
   limit 1;
  if d is not null then perform assign_conversation(tr.conversation_id, d); end if;
  return d;
end;
$$;

revoke execute on function transfer_target_available(uuid) from public, anon;
revoke execute on function requeue_transfer(uuid) from public, anon;
grant execute on function transfer_target_available(uuid) to authenticated;
grant execute on function requeue_transfer(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- conversation_started once per conversation, even when it's reassigned (deactivation,
-- requeue) and the next daee's first message moves it to active again.
-- ---------------------------------------------------------------------------

create or replace function messages_log_daee_events() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
begin
  if new.sender_role <> 'daee' then return null; end if;

  update conversations set status = 'active', started_at = coalesce(started_at, now())
   where id = new.conversation_id and status = 'waiting'
  returning org_id into v_org;
  if found and not exists (
    select 1 from events where conversation_id = new.conversation_id and type = 'conversation_started'
  ) then
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
