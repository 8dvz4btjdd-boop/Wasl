-- Identity layer: relinking a returning asker to a new anonymous session,
-- case-insensitive pseudonyms, return-code rate limiting, and hiding secrets.

-- Let askers.user_id change (returning asker gets a new anonymous auth user).
alter table intakes drop constraint intakes_asker_id_fkey,
  add constraint intakes_asker_id_fkey foreign key (asker_id) references askers(user_id) on delete cascade on update cascade;
alter table conversations drop constraint conversations_asker_id_fkey,
  add constraint conversations_asker_id_fkey foreign key (asker_id) references askers(user_id) on delete cascade on update cascade;
alter table cards drop constraint cards_asker_id_fkey,
  add constraint cards_asker_id_fkey foreign key (asker_id) references askers(user_id) on delete cascade on update cascade;
alter table bookings drop constraint bookings_asker_id_fkey,
  add constraint bookings_asker_id_fkey foreign key (asker_id) references askers(user_id) on delete cascade on update cascade;

-- Moves an asker and everything they own from old_id to new_id. Service role only.
create or replace function relink_asker(old_id uuid, new_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update askers set user_id = new_id where user_id = old_id;
  if not found then
    raise exception 'asker % not found', old_id;
  end if;
  update messages set sender_id = new_id where sender_id = old_id and sender_role = 'asker';
  update notifications set recipient_id = new_id where recipient_id = old_id;
end;
$$;
revoke execute on function relink_asker(uuid, uuid) from public, anon, authenticated;
grant execute on function relink_asker(uuid, uuid) to service_role;

-- Pseudonyms are unique per org regardless of case.
create unique index askers_org_pseudonym_ci on askers (org_id, lower(pseudonym));

-- Failed return attempts per pseudonym. No policies: service role only.
create table return_attempts (
  org_id uuid not null references organizations(id) on delete cascade,
  pseudonym_key text not null,
  failed_count int not null default 0,
  window_started_at timestamptz not null default now(),
  locked_until timestamptz,
  primary key (org_id, pseudonym_key)
);
alter table return_attempts enable row level security;

-- Records one failure atomically and returns locked_until (null if not locked).
-- 5 failures inside 15 minutes lock the pseudonym for 15 minutes.
create or replace function record_return_failure(p_org uuid, p_key text) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  result timestamptz;
begin
  insert into return_attempts as r (org_id, pseudonym_key, failed_count, window_started_at)
  values (p_org, p_key, 1, now())
  on conflict (org_id, pseudonym_key) do update set
    failed_count = case when r.window_started_at < now() - interval '15 minutes' then 1 else r.failed_count + 1 end,
    window_started_at = case when r.window_started_at < now() - interval '15 minutes' then now() else r.window_started_at end;

  update return_attempts
     set locked_until = now() + interval '15 minutes'
   where org_id = p_org and pseudonym_key = p_key and failed_count >= 5
  returning locked_until into result;

  return result;
end;
$$;
revoke execute on function record_return_failure(uuid, text) from public, anon, authenticated;
grant execute on function record_return_failure(uuid, text) to service_role;

-- Hide secrets from client roles. Select explicit columns on these tables; `select *` is denied.
revoke select on organizations from anon, authenticated;
grant select (id, name, languages, hours, ai_enabled, created_at) on organizations to authenticated;

revoke select on askers from anon, authenticated;
grant select (user_id, org_id, pseudonym, background, language, created_at) on askers to authenticated;
