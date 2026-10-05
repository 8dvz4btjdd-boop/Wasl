-- Explainable routing: the conversation keeps how it was classified (topic, depth, by the
-- AI or the asker's chip) and why it went to whom (quality and reasons).

alter table conversations
  add column depth depth_level,
  add column classified_by text check (classified_by in ('ai', 'chip')),
  add column match_quality text check (match_quality in ('full', 'partial', 'none')),
  add column match_reasons jsonb;

drop function if exists route_conversation(uuid);

-- Picks an available daee who speaks the asker's language (topic match first). Returns
-- { daee_id, quality, reasons }: full = language and topic, partial = language only,
-- none = nobody free in the language (the conversation waits). Reasons hold no names
-- beyond the assigned daee's display name, shown to this asker only.
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
   order by coalesce(c.topic = any(p.topics), false) desc,
            open_conversation_count(p.user_id),
            (select max(x.assigned_at) from conversations x where x.daee_id = p.user_id) nulls first
   limit 1
   for update of p;

  if d is null or open_conversation_count(d) >= cap then
    reasons := jsonb_build_object('language', c.language, 'topic', c.topic, 'language_ok', false, 'topic_ok', false, 'available', false);
    update conversations set match_quality = 'none', match_reasons = reasons where id = conv;
    return jsonb_build_object('daee_id', null, 'quality', 'none', 'reasons', reasons);
  end if;

  topic_ok := c.topic is not null and c.topic = any(topics);
  quality := case when topic_ok then 'full' else 'partial' end;
  reasons := jsonb_build_object('name', name, 'language', c.language, 'topic', c.topic,
                                'language_ok', true, 'topic_ok', topic_ok, 'available', true);
  update conversations set match_quality = quality, match_reasons = reasons where id = conv;
  perform assign_conversation(conv, d);
  return jsonb_build_object('daee_id', d, 'quality', quality, 'reasons', reasons);
end;
$$;
revoke execute on function route_conversation(uuid, text, depth_level) from public, anon;
grant execute on function route_conversation(uuid, text, depth_level) to authenticated;

-- The asker corrects the topic while still waiting: store it and route again.
create or replace function correct_topic(conv uuid, p_topic text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c record;
begin
  select id, asker_id, org_id, topic, daee_id, status into c from conversations where id = conv for update;
  if not found or c.asker_id is distinct from auth.uid() then raise exception 'not allowed'; end if;
  if p_topic not in ('quran', 'prophet', 'tawhid', 'worship', 'ethics', 'doubts', 'general') then raise exception 'bad topic'; end if;
  update conversations set topic = p_topic, classified_by = 'chip' where id = conv;
  insert into events (org_id, type, conversation_id, actor_role, meta)
  values (c.org_id, 'classification_corrected', conv, 'asker', jsonb_build_object('from', c.topic, 'to', p_topic));
  -- Already with a daee who hasn't replied yet: hand it back and route on the new topic.
  if c.status = 'waiting' and c.daee_id is not null then
    update conversations set daee_id = null, assigned_at = null, match_quality = null, match_reasons = null where id = conv;
  end if;
  if c.status = 'waiting' then return route_conversation(conv, p_topic, null); end if;
  return jsonb_build_object('daee_id', c.daee_id, 'quality', null, 'reasons', null);
end;
$$;
revoke execute on function correct_topic(uuid, text) from public, anon;
grant execute on function correct_topic(uuid, text) to authenticated;
