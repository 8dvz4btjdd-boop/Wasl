-- Master card: one living Wasl card per asker, merged from their approved session cards.
-- Also: "general" matches every daee in routing.

alter table cards
  add column scope text not null default 'session' check (scope in ('session', 'master')),
  add column source_card_ids uuid[] not null default '{}';
alter table cards alter column conversation_id drop not null;
alter table cards drop constraint cards_conversation_version;
create unique index cards_session_version on cards (conversation_id, version) where scope = 'session';
create unique index cards_master_version on cards (asker_id, version) where scope = 'master';

create or replace function cards_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
begin
  -- A master card's sources are the asker's approved session cards, never messages.
  if new.scope = 'master' then
    if new.conversation_id is not null or cardinality(new.source_message_ids) > 0 then
      raise exception 'a master card has no conversation and no message sources';
    end if;
    if exists (
      select 1 from unnest(new.source_card_ids) as s(id)
       where not exists (select 1 from cards k where k.id = s.id and k.asker_id = new.asker_id and k.scope = 'session' and k.status = 'approved')
    ) then
      raise exception 'master sources must be the asker''s approved session cards';
    end if;
  elsif new.conversation_id is null then
    raise exception 'a session card belongs to a conversation';
  end if;

  if exists (
    select 1 from unnest(new.source_message_ids) as s(id)
     where not exists (select 1 from messages m where m.id = s.id and m.conversation_id = new.conversation_id)
  ) then
    raise exception 'source messages must belong to the conversation';
  end if;

  if tg_op = 'INSERT' then
    if new.status = 'approved' then raise exception 'a new version starts as a draft'; end if;
    return new;
  end if;

  if old.status = 'approved' then
    -- Only removal (soft delete) or expiry may touch an approved version.
    if (new.follow_up, new.covered, new.remaining, new.next_step, new.source_message_ids, new.visibility,
        new.accept_substitute, new.preferred_daee, new.field_sources, new.origin, new.approved_at, new.source_card_ids, new.scope)
       is distinct from
       (old.follow_up, old.covered, old.remaining, old.next_step, old.source_message_ids, old.visibility,
        old.accept_substitute, old.preferred_daee, old.field_sources, old.origin, old.approved_at, old.source_card_ids, old.scope)
       or new.status not in ('approved', 'expired') then
      raise exception 'an approved card is immutable; save a new version';
    end if;
    return new;
  end if;

  if new.status = 'approved' and not service and new.asker_id is distinct from auth.uid() then
    raise exception 'only the asker approves a card';
  end if;
  return new;
end;
$$;


create or replace function route_conversation(conv uuid, p_topic text default null, p_depth depth_level default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c record;
  d uuid;
  cap int;
  topics text[];
  name text;
  topic_ok boolean;
  quality text;
  reasons jsonb;
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
  if p_topic is not null then
    update conversations set topic = p_topic, depth = coalesce(p_depth, depth) where id = conv;
    c.topic := p_topic;
  end if;
  if c.daee_id is not null or c.status <> 'waiting' then
    return jsonb_build_object('daee_id', c.daee_id, 'quality', null, 'reasons', null);
  end if;

  select p.user_id, p.capacity, p.topics, p.display_name into d, cap, topics, name
    from profiles p
   where p.org_id = c.org_id and p.role = 'daee' and p.status = 'available' and presence_fresh(p.last_seen)
     and is_active_staff(p.user_id)
     and c.language = any(p.languages)
     and open_conversation_count(p.user_id) < p.capacity
     and (c.preferred_daee_id is null or p.user_id = c.preferred_daee_id)
   order by (c.topic = 'general' or coalesce(c.topic = any(p.topics), false)) desc,
            open_conversation_count(p.user_id),
            (select max(x.assigned_at) from conversations x where x.daee_id = p.user_id) nulls first
   limit 1
   for update of p;

  if d is null or open_conversation_count(d) >= cap then
    reasons := jsonb_build_object('language', c.language, 'topic', c.topic, 'language_ok', false, 'topic_ok', false, 'available', false);
    update conversations set match_quality = 'none', match_reasons = reasons where id = conv;
    return jsonb_build_object('daee_id', null, 'quality', 'none', 'reasons', reasons);
  end if;

  -- "general" matches every daee: language and availability make it a full match.
  topic_ok := c.topic = 'general' or (c.topic is not null and c.topic = any(topics));
  quality := case when topic_ok then 'full' else 'partial' end;
  reasons := jsonb_build_object('name', name, 'language', c.language, 'topic', c.topic,
                                'language_ok', true, 'topic_ok', topic_ok, 'available', true);
  update conversations set match_quality = quality, match_reasons = reasons where id = conv;
  perform assign_conversation(conv, d);
  return jsonb_build_object('daee_id', d, 'quality', quality, 'reasons', reasons);
end;
$$;


create or replace function admin_kpis(p_from timestamptz, p_to timestamptz) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  o uuid := admin_org();
  routed_n bigint; routed_ok bigint;
  resume_n bigint; resume_ok bigint;
  card_n bigint; card_ok bigint;
  master_n bigint; master_ok bigint;
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

  select count(*), count(*) filter (where (meta ->> 'edited_major')::boolean is false)
    into master_n, master_ok
    from events
   where org_id = o and type = 'master_card_approved' and created_at >= p_from and created_at < p_to;

  return json_build_object(
    'correct_first_routing', json_build_object('n', routed_n, 'correct', routed_ok, 'rate', sample_rate(routed_ok, routed_n)),
    'correct_resumption', json_build_object('n', resume_n, 'correct', resume_ok, 'rate', sample_rate(resume_ok, resume_n)),
    'card_accuracy', json_build_object('n', card_n, 'correct', card_ok, 'rate', sample_rate(card_ok, card_n)),
    'master_card_accuracy', json_build_object('n', master_n, 'correct', master_ok, 'rate', sample_rate(master_ok, master_n))
  );
end;
$$;


-- The asker deletes their master card (every version; access rows cascade).
create or replace function delete_master_card() returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  delete from cards where asker_id = auth.uid() and scope = 'master';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function delete_master_card() from public, anon;
grant execute on function delete_master_card() to authenticated;
