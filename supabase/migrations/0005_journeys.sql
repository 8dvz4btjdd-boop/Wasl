-- The three manual journeys: Wasl cards (versioned, asker-approved, scoped and expiring),
-- transfers between daee, return and resume as linked follow-ups with a rating, and the
-- deactivation gap closed in RLS.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table conversations
  add column previous_conversation_id uuid references conversations(id) on delete set null,
  add column card_id uuid references cards(id) on delete set null,
  add column followup_mode text check (followup_mode in ('none', 'manual', 'ai')),
  add column preferred_daee_id uuid references profiles(user_id) on delete set null,
  add column followup_sufficient boolean;

alter table cards
  add column visibility text not null default 'this_daee' check (visibility in ('this_daee', 'team', 'next_daee')),
  add constraint cards_conversation_version unique (conversation_id, version);

-- ---------------------------------------------------------------------------
-- Active staff (deactivated = banned in Auth) — usable inside RLS
-- ---------------------------------------------------------------------------

create or replace function me_active() returns boolean
language sql stable security definer set search_path = public as $$
  select is_active_staff(auth.uid())
$$;
grant execute on function me_active() to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

-- Nothing is shared until the asker approves: daee no longer see or edit drafts.
drop policy if exists cards_reviewer on cards;
drop policy if exists cards_review_update on cards;

-- An approved, unexpired card is visible to an active daee of the same org when it is
-- shared with the team, or when they hold an access row (this daee / next daee).
create or replace function can_view_card(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from cards k
      join conversations cv on cv.id = k.conversation_id
      join profiles p on p.user_id = auth.uid() and p.role = 'daee' and p.org_id = cv.org_id
     where k.id = c
       and k.status = 'approved'
       and (k.expires_at is null or k.expires_at > now())
       and is_active_staff(auth.uid())
       and (
         k.visibility = 'team'
         or exists (select 1 from card_access a where a.card_id = k.id and a.viewer_id = auth.uid() and a.until > now())
       )
  )
$$;

-- Deactivated daee lose access to their conversations and messages immediately.
drop policy conv_daee_read on conversations;
create policy conv_daee_read on conversations for select to authenticated
  using (conversations.daee_id = auth.uid() and me_active());

drop policy msg_participants on messages;
create policy msg_participants on messages for select to authenticated using (
  exists (
    select 1 from conversations c
     where c.id = messages.conversation_id
       and (c.asker_id = auth.uid() or (c.daee_id = auth.uid() and me_active()))
  )
);

drop policy msg_insert on messages;
create policy msg_insert on messages for insert to authenticated with check (
  messages.sender_id = auth.uid()
  and exists (
    select 1 from conversations c
     where c.id = messages.conversation_id
       and c.status <> 'ended'
       and (c.asker_id = auth.uid() or (c.daee_id = auth.uid() and me_active()))
  )
);

-- Askers may link a new conversation only to their own previous conversation and card.
drop policy conv_asker_insert on conversations;
create policy conv_asker_insert on conversations for insert to authenticated with check (
  conversations.asker_id = auth.uid()
  and conversations.daee_id is null
  and conversations.status = 'waiting'
  and conversations.followup_sufficient is null
  and exists (select 1 from askers a where a.user_id = auth.uid() and a.org_id = conversations.org_id)
  and (conversations.previous_conversation_id is null or exists (
    select 1 from conversations p where p.id = conversations.previous_conversation_id and p.asker_id = auth.uid()))
  and (conversations.card_id is null or exists (
    select 1 from cards k where k.id = conversations.card_id and k.asker_id = auth.uid() and k.status = 'approved'))
);

-- Transfers: read-only for clients; they're created by the functions below.
drop policy transfers_daee on transfers;
create policy transfers_daee on transfers for select to authenticated
  using ((transfers.from_daee = auth.uid() or transfers.to_daee = auth.uid()) and me_active());
create policy transfers_asker on transfers for select to authenticated using (
  exists (select 1 from conversations c where c.id = transfers.conversation_id and c.asker_id = auth.uid())
);

-- ---------------------------------------------------------------------------
-- Card access helper (internal)
-- ---------------------------------------------------------------------------

-- Grants a daee access to the "next daee" cards attached to a conversation: the card the
-- follow-up links to, and any approved card written in the conversation itself.
create or replace function grant_next_daee_cards(conv uuid, d uuid) returns void
language sql security definer set search_path = public as $$
  insert into card_access (card_id, viewer_id, until)
  select k.id, d, k.expires_at
    from cards k
   where k.status = 'approved' and k.visibility = 'next_daee' and k.expires_at > now()
     and (k.id = (select card_id from conversations where id = conv) or k.conversation_id = conv)
  on conflict (card_id, viewer_id) do update set until = excluded.until
$$;
revoke execute on function grant_next_daee_cards(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Routing with a preferred daee
-- ---------------------------------------------------------------------------

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

  perform grant_next_daee_cards(conv, d);
end;
$$;

create or replace function assign_waiting_for(d uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  p record;
  conv uuid;
  assigned int := 0;
begin
  select * into p from profiles
   where user_id = d and role = 'daee' and status = 'available' and is_active_staff(d)
   for update;
  if not found then return 0; end if;

  loop
    exit when open_conversation_count(d) >= p.capacity;
    select cv.id into conv
      from conversations cv
      join askers a on a.user_id = cv.asker_id
     where cv.org_id = p.org_id and cv.status = 'waiting' and cv.daee_id is null
       and (cv.preferred_daee_id is null or cv.preferred_daee_id = d)
       and a.language = any(p.languages)
     order by (cv.preferred_daee_id = d) desc nulls last, cv.created_at
     limit 1
     for update of cv skip locked;
    exit when conv is null;
    perform assign_conversation(conv, d);
    assigned := assigned + 1;
  end loop;
  return assigned;
end;
$$;

-- A follow-up held for a preferred daee goes only to them; it waits until they're free.
create or replace function route_conversation(conv uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  c record;
  d uuid;
  cap int;
begin
  select cv.id, cv.org_id, cv.asker_id, cv.daee_id, cv.status, cv.topic, cv.preferred_daee_id, a.language
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
     and is_active_staff(p.user_id)
     and c.language = any(p.languages)
     and open_conversation_count(p.user_id) < p.capacity
     and (c.preferred_daee_id is null or p.user_id = c.preferred_daee_id)
   order by coalesce(c.topic = any(p.topics), false) desc,
            open_conversation_count(p.user_id),
            (select max(x.assigned_at) from conversations x where x.daee_id = p.user_id) nulls first
   limit 1
   for update of p;
  if d is null then return null; end if;
  if open_conversation_count(d) >= cap then return null; end if;

  perform assign_conversation(conv, d);
  return d;
end;
$$;

-- ---------------------------------------------------------------------------
-- Transfers
-- ---------------------------------------------------------------------------

-- Colleagues the assigned daee can hand a conversation to right now.
create or replace function transfer_candidates(conv uuid)
returns table (user_id uuid, display_name text, open int, capacity int)
language plpgsql stable security definer set search_path = public as $$
declare
  c record;
begin
  select cv.org_id, cv.daee_id, a.language into c
    from conversations cv join askers a on a.user_id = cv.asker_id
   where cv.id = conv and cv.status in ('waiting', 'active');
  if not found or c.daee_id is distinct from auth.uid() or not is_active_staff(auth.uid()) then
    raise exception 'not allowed';
  end if;
  return query
    select p.user_id, p.display_name, open_conversation_count(p.user_id), p.capacity
      from profiles p
     where p.org_id = c.org_id and p.role = 'daee' and p.status = 'available'
       and p.user_id <> auth.uid() and is_active_staff(p.user_id)
       and c.language = any(p.languages)
       and open_conversation_count(p.user_id) < p.capacity
     order by open_conversation_count(p.user_id), p.display_name;
end;
$$;

-- The move itself (internal): reassign, record, log, notify, and share "next daee" cards.
create or replace function do_transfer(t uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  tr record;
  c record;
begin
  select * into tr from transfers where id = t for update;
  update conversations set daee_id = tr.to_daee, assigned_at = now() where id = tr.conversation_id
  returning org_id, asker_id into c;
  update transfers set status = 'accepted' where id = t;

  insert into events (org_id, type, conversation_id, actor_role, meta)
  values (c.org_id, 'transfer_completed', tr.conversation_id, 'daee',
          jsonb_build_object('from_daee', tr.from_daee, 'to_daee', tr.to_daee));

  insert into notifications (recipient_id, type, payload)
  select tr.to_daee, 'conversation_transferred',
         jsonb_build_object('conversation_id', tr.conversation_id, 'pseudonym', a.pseudonym, 'language', a.language)
    from askers a where a.user_id = c.asker_id;

  perform grant_next_daee_cards(tr.conversation_id, tr.to_daee);
end;
$$;
revoke execute on function do_transfer(uuid) from public, anon, authenticated;

-- Hands a conversation to a colleague now, or (ask_card) asks the asker for a card first.
-- Returns 'completed' or 'pending'.
create or replace function transfer_conversation(conv uuid, to_daee uuid, ask_card boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare
  t uuid;
begin
  if not exists (select 1 from transfer_candidates(conv) x where x.user_id = to_daee) then
    raise exception 'target not available';
  end if;
  -- One pending request at a time: a new choice replaces the old one.
  update transfers set status = 'declined' where conversation_id = conv and status = 'pending';
  insert into transfers (conversation_id, from_daee, to_daee, status)
  values (conv, auth.uid(), to_daee, 'pending')
  returning id into t;
  if ask_card then return 'pending'; end if;
  perform do_transfer(t);
  return 'completed';
end;
$$;

-- Completes a pending card-first transfer (by the asker, or the service role after approval).
-- Returns false when the target is no longer free; the request then stays pending.
create or replace function complete_transfer(t uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  tr record;
  c record;
begin
  select tr0.*, cv.asker_id, cv.daee_id, cv.org_id, cv.status as conv_status, a.language
    into tr
    from transfers tr0
    join conversations cv on cv.id = tr0.conversation_id
    join askers a on a.user_id = cv.asker_id
   where tr0.id = t and tr0.status = 'pending';
  if not found then return false; end if;
  if auth.uid() is distinct from tr.asker_id and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'not allowed';
  end if;
  -- The conversation moved on (ended or already with someone else): drop the request.
  if tr.conv_status = 'ended' or tr.daee_id is distinct from tr.from_daee then
    update transfers set status = 'declined' where id = t;
    return false;
  end if;
  select 1 into c from profiles p
   where p.user_id = tr.to_daee and p.role = 'daee' and p.status = 'available' and is_active_staff(p.user_id)
     and tr.language = any(p.languages) and open_conversation_count(p.user_id) < p.capacity;
  if not found then return false; end if;
  perform do_transfer(t);
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cards and follow-ups
-- ---------------------------------------------------------------------------

-- The messages an asker selected for a card, for whoever may see that card. This is the only
-- way a daee reads messages outside their own conversations.
create or replace function card_sources(card uuid)
returns table (id uuid, sender_role text, body text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  k record;
begin
  select * into k from cards where cards.id = card;
  if not found then return; end if;
  if k.asker_id is distinct from auth.uid() and not can_view_card(card) then raise exception 'not allowed'; end if;
  return query
    select m.id, m.sender_role, m.body, m.created_at
      from messages m
     where m.conversation_id = k.conversation_id and m.id = any(k.source_message_ids)
     order by m.created_at;
end;
$$;

-- One-click "was the context enough?" on a follow-up, once, after a substantive daee reply.
create or replace function rate_followup(conv uuid, sufficient boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  c record;
begin
  select * into c from conversations where id = conv for update;
  if not found or c.daee_id is distinct from auth.uid() or not is_active_staff(auth.uid()) then
    raise exception 'not allowed';
  end if;
  if c.previous_conversation_id is null or c.followup_sufficient is not null then raise exception 'not applicable'; end if;
  if not exists (
    select 1 from messages m
     where m.conversation_id = conv and m.sender_role = 'daee' and char_length(btrim(m.body)) > 40
  ) then
    raise exception 'too early';
  end if;
  update conversations set followup_sufficient = sufficient where id = conv;
  insert into events (org_id, type, conversation_id, actor_role, meta)
  values (c.org_id, 'followup_rated', conv, 'daee',
          jsonb_build_object('mode', coalesce(c.followup_mode, 'none'), 'sufficient', sufficient));
end;
$$;

-- ---------------------------------------------------------------------------
-- Deactivation: open conversations go back to the queue
-- ---------------------------------------------------------------------------

create or replace function release_daee_conversations(d uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  conv uuid;
  released int := 0;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then raise exception 'not allowed'; end if;
  -- Follow-ups held for this daee may go to anyone now.
  update conversations set preferred_daee_id = null where preferred_daee_id = d and daee_id is null and status = 'waiting';
  for conv in
    select id from conversations where daee_id = d and status in ('waiting', 'active')
  loop
    update conversations set daee_id = null, assigned_at = null, status = 'waiting', preferred_daee_id = null where id = conv;
    update transfers set status = 'declined' where conversation_id = conv and status = 'pending';
    perform route_conversation(conv);
    released := released + 1;
  end loop;
  return released;
end;
$$;

revoke execute on function transfer_candidates(uuid) from public, anon;
revoke execute on function transfer_conversation(uuid, uuid, boolean) from public, anon;
revoke execute on function complete_transfer(uuid) from public, anon;
revoke execute on function card_sources(uuid) from public, anon;
revoke execute on function rate_followup(uuid, boolean) from public, anon;
revoke execute on function release_daee_conversations(uuid) from public, anon, authenticated;
grant execute on function transfer_candidates(uuid) to authenticated;
grant execute on function transfer_conversation(uuid, uuid, boolean) to authenticated;
grant execute on function complete_transfer(uuid) to authenticated, service_role;
grant execute on function card_sources(uuid) to authenticated;
grant execute on function rate_followup(uuid, boolean) to authenticated;
grant execute on function release_daee_conversations(uuid) to service_role;
