-- Presence truth (heartbeat, stale daee are offline), card retention and deletion,
-- and the follow-up rating at the end of the conversation.

-- ---------------------------------------------------------------------------
-- Presence: last_seen, a 90-second freshness rule, heartbeat, expiry
-- ---------------------------------------------------------------------------

alter table profiles add column last_seen timestamptz not null default now();

-- The one threshold: a daee whose workspace has not checked in for 90 seconds is offline.
create or replace function presence_fresh(ts timestamptz) returns boolean
language sql stable set search_path = public as $$
  select ts > now() - interval '90 seconds'
$$;

-- Called by the workspace every 30 seconds. A gap over 90 seconds means the daee left
-- (closed the tab, lost the connection): they come back offline and choose again.
create or replace function presence_heartbeat() returns presence
language plpgsql security definer set search_path = public as $$
declare
  s presence;
begin
  update profiles
     set status = case when presence_fresh(last_seen) then status else 'offline'::presence end,
         last_seen = now()
   where user_id = auth.uid() and role = 'daee'
  returning status into s;
  return s;
end;
$$;
revoke execute on function presence_heartbeat() from public, anon;
grant execute on function presence_heartbeat() to authenticated;

-- Keeps the stored status true for every reader (admin team table, resume panel).
create or replace function expire_stale_presence() returns int
language sql security definer set search_path = public as $$
  with gone as (
    update profiles set status = 'offline'
     where role = 'daee' and status <> 'offline' and not presence_fresh(last_seen)
    returning 1
  )
  select count(*)::int from gone
$$;
revoke execute on function expire_stale_presence() from public, anon, authenticated;

-- Every availability check below also requires a fresh heartbeat.

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
   where user_id = d and role = 'daee' and status = 'available' and presence_fresh(last_seen) and is_active_staff(d)
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
   where p.org_id = c.org_id and p.role = 'daee' and p.status = 'available' and presence_fresh(p.last_seen)
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
     where p.org_id = c.org_id and p.role = 'daee' and p.status = 'available' and presence_fresh(p.last_seen)
       and p.user_id <> auth.uid() and is_active_staff(p.user_id)
       and c.language = any(p.languages)
       and open_conversation_count(p.user_id) < p.capacity
     order by open_conversation_count(p.user_id), p.display_name;
end;
$$;

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
   where p.user_id = tr.to_daee and p.role = 'daee' and p.status = 'available' and presence_fresh(p.last_seen) and is_active_staff(p.user_id)
     and tr.language = any(p.languages) and open_conversation_count(p.user_id) < p.capacity;
  if not found then return false; end if;
  perform do_transfer(t);
  return true;
end;
$$;

create or replace function admin_ops_snapshot() returns json
language plpgsql stable security definer set search_path = public as $$
declare
  o uuid := admin_org();
begin
  return json_build_object(
    'available_daee', (select count(*) from profiles p
                        where p.org_id = o and p.role = 'daee' and p.status = 'available' and presence_fresh(p.last_seen) and is_active_staff(p.user_id)),
    'waiting', (select count(*) from conversations where org_id = o and status = 'waiting'),
    'longest_wait_seconds', (select extract(epoch from now() - min(created_at))::int
                               from conversations where org_id = o and status = 'waiting'),
    'active', (select count(*) from conversations where org_id = o and status = 'active'),
    'as_of', now()
  );
end;
$$;

create or replace function admin_alerts(threshold_minutes int default null) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  o uuid := admin_org();
  threshold int;
begin
  select coalesce(threshold_minutes, wait_alert_minutes) into threshold from organizations where id = o;
  return json_build_object(
    'threshold_minutes', threshold,
    'long_waits', coalesce((
      select json_agg(json_build_object('language', a.language, 'since', c.created_at) order by c.created_at)
        from conversations c join askers a on a.user_id = c.asker_id
       where c.org_id = o and c.status = 'waiting' and c.created_at < now() - make_interval(mins => threshold)
    ), '[]'::json),
    'uncovered_languages', coalesce((
      select json_agg(json_build_object('language', w.language, 'count', w.n, 'since', w.since) order by w.since)
        from (
          select a.language, count(*) as n, min(c.created_at) as since
            from conversations c join askers a on a.user_id = c.asker_id
           where c.org_id = o and c.status = 'waiting' and c.daee_id is null
             and not exists (
               select 1 from profiles p
                where p.org_id = o and p.role = 'daee' and p.status = 'available' and presence_fresh(p.last_seen)
                  and is_active_staff(p.user_id) and a.language = any(p.languages)
             )
           group by a.language
        ) w
    ), '[]'::json)
  );
end;
$$;

create or replace function public_availability(p_language text) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int
    from profiles p
   where p.org_id = (select id from organizations order by created_at limit 1)
     and p.role = 'daee'
     and p.status = 'available' and presence_fresh(p.last_seen)
     and p_language = any(p.languages)
     and is_active_staff(p.user_id)
$$;

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
     where p.user_id = tr.to_daee and p.role = 'daee' and p.status = 'available' and presence_fresh(p.last_seen) and is_active_staff(p.user_id)
       and tr.language = any(p.languages) and open_conversation_count(p.user_id) < p.capacity
  );
end;
$$;

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
   where p.org_id = tr.org_id and p.role = 'daee' and p.status = 'available' and presence_fresh(p.last_seen)
     and p.user_id <> tr.from_daee and is_active_staff(p.user_id)
     and tr.language = any(p.languages) and open_conversation_count(p.user_id) < p.capacity
   order by open_conversation_count(p.user_id)
   limit 1;
  if d is not null then perform assign_conversation(tr.conversation_id, d); end if;
  return d;
end;
$$;

-- KPIs: resumption counts the sessions whose 'sufficient' question was answered.

create or replace function admin_kpis(p_from timestamptz, p_to timestamptz) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  o uuid := admin_org();
  routed_n bigint; routed_ok bigint;
  resume_n bigint; resume_ok bigint;
  card_n bigint; card_ok bigint;
begin
  select count(distinct e.conversation_id),
         count(distinct e.conversation_id) filter (where not exists (
           select 1 from events t where t.org_id = o and t.type = 'transfer_completed' and t.conversation_id = e.conversation_id))
    into routed_n, routed_ok
    from events e
   where e.org_id = o and e.type = 'routed' and e.created_at >= p_from and e.created_at < p_to;

  select count(*), count(*) filter (where (meta ->> 'sufficient')::boolean is true)
    into resume_n, resume_ok
    from events
   where org_id = o and type = 'followup_rated' and meta ->> 'mode' in ('manual', 'ai') and meta ->> 'sufficient' is not null
     and created_at >= p_from and created_at < p_to;

  select count(*), count(*) filter (where (meta ->> 'edited_major')::boolean is false)
    into card_n, card_ok
    from events
   where org_id = o and type = 'card_approved' and created_at >= p_from and created_at < p_to;

  return json_build_object(
    'correct_first_routing', json_build_object('n', routed_n, 'correct', routed_ok, 'rate', sample_rate(routed_ok, routed_n)),
    'correct_resumption', json_build_object('n', resume_n, 'correct', resume_ok, 'rate', sample_rate(resume_ok, resume_n)),
    'card_accuracy', json_build_object('n', card_n, 'correct', card_ok, 'rate', sample_rate(card_ok, card_n))
  );
end;
$$;

create or replace function admin_comparison(p_from timestamptz, p_to timestamptz) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  o uuid := admin_org();
begin
  return (
    select json_agg(row_to_json(r) order by r.sort)
      from (
        select m.mode, m.sort,
               (select count(*) from events s
                 where s.org_id = o and s.type = 'followup_started' and s.meta ->> 'mode' = m.mode
                   and s.created_at >= p_from and s.created_at < p_to) as sessions,
               reply.n_reply,
               reply.median_first_reply_seconds,
               rated.n_rated,
               rated.sufficient,
               sample_rate(rated.sufficient, rated.n_rated) as sufficiency_rate
          from (values ('none', 1), ('manual', 2), ('ai', 3)) as m(mode, sort)
          cross join lateral (
            select count(*) as n_reply,
                   round((percentile_cont(0.5) within group (order by x.seconds))::numeric)::int as median_first_reply_seconds
              from (
                select extract(epoch from (
                         select min(f.created_at) from events f
                          where f.org_id = o and f.type = 'first_substantive_reply'
                            and f.conversation_id = s.conversation_id and f.created_at >= s.created_at
                       ) - s.created_at) as seconds
                  from events s
                 where s.org_id = o and s.type = 'followup_started' and s.meta ->> 'mode' = m.mode
                   and s.created_at >= p_from and s.created_at < p_to
              ) x
             where x.seconds is not null
          ) reply
          cross join lateral (
            select count(*) as n_rated,
                   count(*) filter (where (r.meta ->> 'sufficient')::boolean is true) as sufficient
              from events r
             where r.org_id = o and r.type = 'followup_rated' and r.meta ->> 'mode' = m.mode and r.meta ->> 'sufficient' is not null
               and r.created_at >= p_from and r.created_at < p_to
          ) rated
      ) r
  );
end;
$$;

create or replace function set_presence(p_status presence) returns int
language plpgsql security definer set search_path = public as $$
begin
  if p_status <> 'offline' and not is_active_staff(auth.uid()) then raise exception 'deactivated'; end if;
  update profiles set status = p_status, last_seen = now() where user_id = auth.uid() and role = 'daee';
  if not found then raise exception 'not a daee'; end if;
  if p_status = 'available' then return assign_waiting_for(auth.uid()); end if;
  return 0;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cards: no expiry by default, deletion by the asker, 12-month inactivity removal
-- ---------------------------------------------------------------------------

create or replace function grant_next_daee_cards(conv uuid, d uuid) returns void
language sql security definer set search_path = public as $$
  insert into card_access (card_id, viewer_id, until)
  select k.id, d, coalesce(k.expires_at, 'infinity')
    from cards k
   where k.status = 'approved' and k.visibility = 'next_daee' and coalesce(k.expires_at, 'infinity') > now()
     and (k.id = (select card_id from conversations where id = conv) or k.conversation_id = conv)
  on conflict (card_id, viewer_id) do update set until = excluded.until
$$;
revoke execute on function grant_next_daee_cards(uuid, uuid) from public, anon, authenticated;

-- The asker deletes their card for a conversation: every version, and with them every
-- access row (cascade). Follow-ups keep running; their card link becomes null.
create or replace function delete_card(conv uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  if not exists (select 1 from conversations where id = conv and asker_id = auth.uid()) then
    raise exception 'not allowed';
  end if;
  delete from cards where conversation_id = conv and asker_id = auth.uid();
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function delete_card(uuid) from public, anon;
grant execute on function delete_card(uuid) to authenticated;

-- Cards with no activity for 12 months (no new version, approval or follow-up from them).
create or replace function purge_inactive_cards() returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  with activity as (
    select k.conversation_id,
           greatest(max(k.created_at), max(k.approved_at),
                    max((select max(f.created_at) from conversations f where f.card_id = k.id))) as last_active
      from cards k
     group by k.conversation_id
  )
  delete from cards k
   using activity a
   where k.conversation_id = a.conversation_id and a.last_active < now() - interval '12 months';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function purge_inactive_cards() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Follow-up rating at the end of the conversation
-- ---------------------------------------------------------------------------

alter table conversations add column followup_card_accurate boolean;

drop function if exists rate_followup(uuid, boolean);

-- The assigned daee, while ending a follow-up (any mode): was the context enough to go on
-- without starting over, and (only when the follow-up had a card) was the card accurate?
-- Either answer may be null (skipped); with both skipped nothing is logged. Once per
-- conversation.
create or replace function rate_followup(conv uuid, sufficient boolean, card_accurate boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  c record;
  accurate boolean;
begin
  select * into c from conversations where id = conv for update;
  if not found or c.daee_id is distinct from auth.uid() or not is_active_staff(auth.uid()) then
    raise exception 'not allowed';
  end if;
  if c.previous_conversation_id is null then raise exception 'not a follow-up'; end if;
  if exists (select 1 from events where conversation_id = conv and type = 'followup_rated') then
    raise exception 'already rated';
  end if;
  accurate := case when c.card_id is null then null else card_accurate end;
  if sufficient is null and accurate is null then return; end if;
  update conversations set followup_sufficient = sufficient, followup_card_accurate = accurate where id = conv;
  insert into events (org_id, type, conversation_id, actor_role, meta)
  values (c.org_id, 'followup_rated', conv, 'daee',
          jsonb_build_object('mode', coalesce(c.followup_mode, 'none'), 'sufficient', sufficient, 'card_accurate', accurate));
end;
$$;
revoke execute on function rate_followup(uuid, boolean, boolean) from public, anon;
grant execute on function rate_followup(uuid, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Scheduled jobs
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron;
select cron.schedule('wasl-presence-expiry', '30 seconds', 'select public.expire_stale_presence()');
select cron.schedule('wasl-card-retention', '15 0 * * *', 'select public.purge_inactive_cards()');
