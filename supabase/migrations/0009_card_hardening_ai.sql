-- Card model hardening (immutable approved versions, validated sources, asker-only
-- approval, soft delete) and the columns the AI card needs (origin, per-field sources,
-- the generated draft for edited_major, rate limiting by actor).

alter table cards
  add column deleted_at timestamptz,
  add column origin text not null default 'manual' check (origin in ('manual', 'ai')),
  add column field_sources jsonb not null default '{}',
  add column ai_draft jsonb;

alter table ai_runs add column actor_id uuid;
create index on ai_runs (task, actor_id, created_at);

-- Viewers: approved, not expired, not deleted, and shared with them.
create or replace function can_view_card(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from cards k
      join conversations cv on cv.id = k.conversation_id
      join profiles p on p.user_id = auth.uid() and p.role = 'daee' and p.org_id = cv.org_id
     where k.id = c
       and k.status = 'approved'
       and k.deleted_at is null
       and (k.expires_at is null or k.expires_at > now())
       and is_active_staff(auth.uid())
       and (
         k.visibility = 'team'
         or exists (select 1 from card_access a where a.card_id = k.id and a.viewer_id = auth.uid() and a.until > now())
       )
  )
$$;

-- Every write to a card: its source messages belong to its conversation; only the asker
-- approves; an approved version never changes (edits are a new draft version, so viewers
-- keep seeing the last approved one until the asker approves again).
create or replace function cards_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
begin
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
        new.accept_substitute, new.preferred_daee, new.field_sources, new.origin, new.approved_at)
       is distinct from
       (old.follow_up, old.covered, old.remaining, old.next_step, old.source_message_ids, old.visibility,
        old.accept_substitute, old.preferred_daee, old.field_sources, old.origin, old.approved_at)
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

drop trigger if exists cards_guard on cards;
create trigger cards_guard before insert or update on cards
  for each row execute function cards_guard();
