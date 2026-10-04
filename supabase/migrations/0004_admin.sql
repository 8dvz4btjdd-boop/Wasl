-- Admin workspace: aggregate-only metric functions (docs/kpis.md), a wait alert threshold,
-- hiding AI output from client roles, and routing that skips deactivated (banned) daee.

-- ---------------------------------------------------------------------------
-- Settings and privacy
-- ---------------------------------------------------------------------------

alter table organizations
  add column wait_alert_minutes int not null default 10 check (wait_alert_minutes between 1 and 240);
grant select (wait_alert_minutes) on organizations to authenticated;

-- AI output can contain generated card text. Admins read run metadata only.
revoke select on ai_runs from anon, authenticated;
grant select (id, org_id, task, model, latency_ms, fallback, reason, created_at) on ai_runs to authenticated;

-- Live presence for the admin overview and team table (profiles are readable to staff already).
alter publication supabase_realtime add table profiles;

-- ---------------------------------------------------------------------------
-- Deactivation: a daee is deactivated by banning their auth user (no schema column).
-- Routing and presence ignore deactivated daee immediately.
-- ---------------------------------------------------------------------------

create or replace function is_active_staff(uid uuid) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select not exists (select 1 from auth.users u where u.id = uid and u.banned_until is not null and u.banned_until > now())
$$;
revoke execute on function is_active_staff(uuid) from public, anon, authenticated;

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
     and is_active_staff(p.user_id)
     and c.language = any(p.languages)
     and open_conversation_count(p.user_id) < p.capacity
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

create or replace function set_presence(p_status presence) returns int
language plpgsql security definer set search_path = public as $$
begin
  if p_status <> 'offline' and not is_active_staff(auth.uid()) then raise exception 'deactivated'; end if;
  update profiles set status = p_status where user_id = auth.uid() and role = 'daee';
  if not found then raise exception 'not a daee'; end if;
  if p_status = 'available' then return assign_waiting_for(auth.uid()); end if;
  return 0;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin metrics (aggregates only; every function checks is_admin())
-- ---------------------------------------------------------------------------

create or replace function admin_org() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  o uuid;
begin
  if not is_admin() then raise exception 'not allowed'; end if;
  select org_id into o from profiles where user_id = auth.uid();
  return o;
end;
$$;
revoke execute on function admin_org() from public, anon, authenticated;

-- Rate with the minimum-sample rule: null below n = 5.
create or replace function sample_rate(part bigint, n bigint) returns numeric
language sql immutable as $$
  select case when n >= 5 then round(part::numeric / n, 4) else null end
$$;

create or replace function admin_ops_snapshot() returns json
language plpgsql stable security definer set search_path = public as $$
declare
  o uuid := admin_org();
begin
  return json_build_object(
    'available_daee', (select count(*) from profiles p
                        where p.org_id = o and p.role = 'daee' and p.status = 'available' and is_active_staff(p.user_id)),
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
                where p.org_id = o and p.role = 'daee' and p.status = 'available'
                  and is_active_staff(p.user_id) and a.language = any(p.languages)
             )
           group by a.language
        ) w
    ), '[]'::json)
  );
end;
$$;

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
   where org_id = o and type = 'followup_rated' and meta ->> 'mode' in ('manual', 'ai')
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
             where r.org_id = o and r.type = 'followup_rated' and r.meta ->> 'mode' = m.mode
               and r.created_at >= p_from and r.created_at < p_to
          ) rated
      ) r
  );
end;
$$;

create or replace function admin_ai_health(p_from timestamptz, p_to timestamptz) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  o uuid := admin_org();
begin
  return (
    select json_build_object(
             'runs', count(*),
             'fallbacks', count(*) filter (where fallback),
             'fallback_rate', sample_rate(count(*) filter (where fallback), count(*)),
             'median_latency_ms', round((percentile_cont(0.5) within group (order by latency_ms))::numeric)::int,
             'n_latency', count(latency_ms)
           )
      from ai_runs
     where org_id = o and created_at >= p_from and created_at < p_to
  );
end;
$$;

revoke execute on function admin_ops_snapshot() from public, anon;
revoke execute on function admin_alerts(int) from public, anon;
revoke execute on function admin_kpis(timestamptz, timestamptz) from public, anon;
revoke execute on function admin_comparison(timestamptz, timestamptz) from public, anon;
revoke execute on function admin_ai_health(timestamptz, timestamptz) from public, anon;
grant execute on function admin_ops_snapshot() to authenticated;
grant execute on function admin_alerts(int) to authenticated;
grant execute on function admin_kpis(timestamptz, timestamptz) to authenticated;
grant execute on function admin_comparison(timestamptz, timestamptz) to authenticated;
grant execute on function admin_ai_health(timestamptz, timestamptz) to authenticated;
