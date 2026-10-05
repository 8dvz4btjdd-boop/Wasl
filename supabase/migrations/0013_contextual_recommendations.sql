-- Private, durable recommendation leases. No conversation body, question, belief,
-- query, or prompt is logged here. Results contain only source materials/metadata.
-- The application validates current assignment and release policy before every read.
create table public.recommendation_jobs (
  request_id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  org_id uuid not null references public.organizations(id),
  actor_id uuid not null references auth.users(id) on delete cascade,
  audience text not null check (audience in ('asker', 'daee')),
  context_version text not null check (char_length(context_version) between 1 and 256),
  mode text not null check (mode in ('automatic', 'refresh', 'expand')),
  locale text not null check (locale in ('ar', 'en', 'fr', 'es', 'ur', 'id', 'tl')),
  state text not null default 'running' check (state in ('running', 'done', 'closed')),
  lease_until timestamptz not null default now() + interval '35 seconds',
  result jsonb,
  model_calls integer not null default 0 check (model_calls >= 0),
  model_steps integer not null default 0 check (model_steps >= 0),
  searches integer not null default 0 check (searches >= 0),
  fetches integer not null default 0 check (fetches >= 0),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cache_read_tokens integer not null default 0 check (cache_read_tokens >= 0),
  cache_write_tokens integer not null default 0 check (cache_write_tokens >= 0),
  uncached_input_tokens integer not null default 0 check (uncached_input_tokens >= 0),
  estimated_usd numeric(12, 6) check (estimated_usd >= 0),
  voice_usd numeric(12, 6) not null default 0 check (voice_usd >= 0),
  elapsed_ms integer not null default 0 check (elapsed_ms >= 0),
  pricing_verified boolean not null default false,
  provider_searches integer check (provider_searches >= 0),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (conversation_id, audience, actor_id, context_version, mode, locale),
  check (result is null or jsonb_typeof(result) = 'object' and octet_length(result::text) <= 100000)
);
create index recommendation_jobs_leases on public.recommendation_jobs(conversation_id, audience, created_at desc);
alter table public.recommendation_jobs enable row level security;
-- No anon/authenticated policy: even administrators cannot read these source/context caches.
revoke all on public.recommendation_jobs from public, anon, authenticated;
grant all on public.recommendation_jobs to service_role;

create function public.recommendation_claim(
  p_conversation uuid, p_audience text, p_actor uuid, p_context text, p_mode text, p_locale text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c record;
  j public.recommendation_jobs%rowtype;
  active_until timestamptz;
  last_started timestamptz;
  now_at timestamptz := clock_timestamp();
begin
  if p_audience not in ('asker', 'daee') or p_mode not in ('automatic', 'refresh', 'expand')
     or p_locale not in ('ar', 'en', 'fr', 'es', 'ur', 'id', 'tl') or char_length(p_context) not between 1 and 256 then
    raise exception 'invalid recommendation request';
  end if;
  -- A refresh of the same need reuses the quick job. Expansion is a separately
  -- requested, bounded budget; retry/refresh cannot mint another quick budget.
  p_mode := case when p_mode = 'expand' then 'expand' else 'automatic' end;
  -- Cross-process serialization; separate actors cannot race the same conversation/audience.
  perform pg_advisory_xact_lock(hashtextextended(p_conversation::text || ':' || p_audience, 0));
  select id, org_id, asker_id, daee_id, status, started_at into c from public.conversations where id = p_conversation;
  if not found or (p_audience = 'asker' and (c.asker_id is distinct from p_actor or c.status <> 'waiting' or c.started_at is not null))
     or (p_audience = 'daee' and (c.daee_id is distinct from p_actor or c.status not in ('waiting', 'active')
       or not public.is_active_staff(p_actor) or not exists(select 1 from public.profiles where user_id = p_actor and role = 'daee'))) then
    raise exception 'not allowed';
  end if;
  select * into j from public.recommendation_jobs where conversation_id = p_conversation
    and audience = p_audience and actor_id = p_actor and context_version = p_context and mode = p_mode and locale = p_locale;
  if found then
    if j.state = 'running' and j.lease_until > now_at then
      return jsonb_build_object('state', 'running', 'retryAfterMs', greatest(1, ceil(extract(epoch from j.lease_until - now_at) * 1000)));
    end if;
    if j.state = 'running' then
      -- A timed-out/abandoned request is never restarted with a fresh paid budget.
      update public.recommendation_jobs set state = 'closed', finished_at = now_at where request_id = j.request_id;
    end if;
    return jsonb_build_object('state', 'cached', 'requestId', j.request_id, 'actorId', j.actor_id,
      'contextVersion', j.context_version, 'audience', j.audience,
      'result', coalesce(j.result, jsonb_build_object(
        'requestId', j.request_id, 'contextVersion', j.context_version, 'status', 'unavailable', 'reason', 'request_closed',
        'materials', '[]'::jsonb, 'clarification', null, 'generatedReligiousAnswer', false,
        'usage', jsonb_build_object('modelCalls', j.model_calls, 'modelSteps', j.model_steps, 'searches', j.searches, 'fetches', j.fetches,
          'inputTokens', j.input_tokens, 'outputTokens', j.output_tokens, 'cacheReadTokens', j.cache_read_tokens, 'cacheWriteTokens', j.cache_write_tokens,
          'uncachedInputTokens', j.uncached_input_tokens, 'costEstimateUsd', j.estimated_usd, 'elapsedMs', j.elapsed_ms,
          'pricingVerified', j.pricing_verified, 'providerReportedSearches', j.provider_searches, 'voiceCostUsd', j.voice_usd, 'codexDevelopmentCostIncluded', false))));
  end if;
  select max(lease_until) into active_until from public.recommendation_jobs
    where conversation_id = p_conversation and audience = p_audience and state = 'running' and lease_until > now_at;
  if active_until is not null then
    return jsonb_build_object('state', 'running', 'retryAfterMs', greatest(1, ceil(extract(epoch from active_until - now_at) * 1000)));
  end if;
  select max(created_at) into last_started from public.recommendation_jobs where conversation_id = p_conversation and audience = p_audience;
  if last_started > now_at - interval '20 seconds' then
    return jsonb_build_object('state', 'cooldown', 'retryAfterMs', greatest(1, ceil(extract(epoch from last_started + interval '20 seconds' - now_at) * 1000)));
  end if;
  insert into public.recommendation_jobs(conversation_id, org_id, actor_id, audience, context_version, mode, locale, created_at, lease_until)
    values(p_conversation, c.org_id, p_actor, p_audience, p_context, p_mode, p_locale, now_at, now_at + interval '35 seconds') returning * into j;
  return jsonb_build_object('state', 'start', 'requestId', j.request_id);
end;
$$;

create function public.recommendation_finish(p_request uuid, p_result jsonb, p_usage jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  -- Whitelist numeric usage fields; never retain extra provider/request properties.
  update public.recommendation_jobs set
    state = case when p_result is null then 'closed' else 'done' end,
    result = p_result, finished_at = clock_timestamp(),
    model_calls = greatest(model_calls, coalesce((p_usage->>'modelCalls')::integer, 0)),
    model_steps = greatest(model_steps, coalesce((p_usage->>'modelSteps')::integer, 0)),
    searches = greatest(searches, coalesce((p_usage->>'searches')::integer, 0)),
    fetches = greatest(fetches, coalesce((p_usage->>'fetches')::integer, 0)),
    input_tokens = greatest(input_tokens, coalesce((p_usage->>'inputTokens')::integer, 0)),
    output_tokens = greatest(output_tokens, coalesce((p_usage->>'outputTokens')::integer, 0)),
    cache_read_tokens = greatest(cache_read_tokens, coalesce((p_usage->>'cacheReadTokens')::integer, 0)),
    cache_write_tokens = greatest(cache_write_tokens, coalesce((p_usage->>'cacheWriteTokens')::integer, 0)),
    uncached_input_tokens = greatest(uncached_input_tokens, coalesce((p_usage->>'uncachedInputTokens')::integer, 0)),
    estimated_usd = (p_usage->>'costEstimateUsd')::numeric,
    voice_usd = greatest(voice_usd, coalesce((p_usage->>'voiceCostUsd')::numeric, 0)),
    elapsed_ms = greatest(elapsed_ms, coalesce((p_usage->>'elapsedMs')::integer, 0)),
    pricing_verified = coalesce((p_usage->>'pricingVerified')::boolean, false),
    provider_searches = (p_usage->>'providerReportedSearches')::integer
  where request_id = p_request and state = 'running';
  return found;
end;
$$;
revoke all on function public.recommendation_claim(uuid, text, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.recommendation_finish(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.recommendation_claim(uuid, text, uuid, text, text, text) to service_role;
grant execute on function public.recommendation_finish(uuid, jsonb, jsonb) to service_role;
