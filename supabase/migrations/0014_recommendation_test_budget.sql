-- The user authorized at most USD 5 for this feature's connected tests. The scope
-- is global across organizations/processes and does not reset at midnight or retry.
-- Reservations are conservative per-request upper bounds, not actual charges.
-- There is deliberately no refund/reset RPC in this first implementation.
create table public.recommendation_budget_authorizations (
  authorization_id text primary key,
  reserved_usd numeric(12, 6) not null default 0 check (reserved_usd between 0 and 5),
  approved_limit_usd numeric(12, 6) not null default 5 check (approved_limit_usd > 0 and approved_limit_usd <= 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.recommendation_budget_reservations (
  -- No cascading job FK: removing a conversation must not erase already-spent allowance.
  request_id uuid primary key,
  authorization_id text not null references public.recommendation_budget_authorizations(authorization_id),
  org_id uuid not null references public.organizations(id),
  reserved_usd numeric(12, 6) not null check (reserved_usd > 0 and reserved_usd <= 0.35),
  reserved_on_utc date not null default (now() at time zone 'UTC')::date,
  created_at timestamptz not null default now()
);
alter table public.recommendation_budget_authorizations enable row level security;
alter table public.recommendation_budget_reservations enable row level security;
revoke all on public.recommendation_budget_authorizations from public, anon, authenticated;
revoke all on public.recommendation_budget_reservations from public, anon, authenticated;
grant all on public.recommendation_budget_authorizations to service_role;
grant all on public.recommendation_budget_reservations to service_role;

create function public.recommendation_reserve_budget(p_request uuid, p_org uuid, p_amount numeric, p_total_limit numeric)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  budget_scope constant text := 'contextual-test-2026-10-05';
  job record;
  previous public.recommendation_budget_reservations%rowtype;
  total public.recommendation_budget_authorizations%rowtype;
  amount numeric(12, 6);
  limit_usd numeric(12, 6);
begin
  if p_amount is null or p_total_limit is null or p_amount::text in ('NaN', 'Infinity', '-Infinity')
    or p_total_limit::text in ('NaN', 'Infinity', '-Infinity') or p_amount <= 0 or p_total_limit <= 0 then return false; end if;
  select org_id, mode, state into job from public.recommendation_jobs where request_id = p_request;
  if not found or job.org_id is distinct from p_org or job.state <> 'running'
    or p_amount > (case when job.mode = 'expand' then 0.35 else 0.15 end) then return false; end if;
  -- The server cannot turn a larger caller-provided limit into a larger authorization.
  amount := p_amount;
  limit_usd := least(p_total_limit, 5);
  if amount <= 0 or amount > limit_usd then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('recommendation-budget:' || budget_scope, 0));
  select * into previous from public.recommendation_budget_reservations where request_id = p_request;
  if found then
    return previous.authorization_id = budget_scope and previous.org_id = p_org
      and previous.reserved_usd = amount;
  end if;
  insert into public.recommendation_budget_authorizations(authorization_id)
    values(budget_scope) on conflict(authorization_id) do nothing;
  select * into total from public.recommendation_budget_authorizations where authorization_id = budget_scope for update;
  if total.reserved_usd + amount > least(total.approved_limit_usd, limit_usd) then return false; end if;
  insert into public.recommendation_budget_reservations(request_id, authorization_id, org_id, reserved_usd)
    values(p_request, budget_scope, p_org, amount);
  update public.recommendation_budget_authorizations set reserved_usd = reserved_usd + amount, updated_at = clock_timestamp()
    where authorization_id = budget_scope;
  return true;
end;
$$;
revoke all on function public.recommendation_reserve_budget(uuid, uuid, numeric, numeric) from public, anon, authenticated;
grant execute on function public.recommendation_reserve_budget(uuid, uuid, numeric, numeric) to service_role;
