create extension if not exists pgcrypto with schema extensions;

create type user_role as enum ('admin','daee');
create type presence as enum ('available','busy','offline');
create type intake_status as enum ('draft','classified','routed','abandoned');
create type conv_status as enum ('waiting','active','transferred','ended');
create type card_status as enum ('draft','daee_reviewed','approved','expired');
create type card_origin as enum ('ai','manual');
create type transfer_status as enum ('pending','accepted','declined');
create type booking_status as enum ('requested','confirmed','cancelled','done');
create type depth_level as enum ('intro','explain','detailed');

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  languages text[] not null default '{ar,en,fr,es}',
  hours text,
  ai_enabled boolean not null default true,
  return_code_salt text not null default encode(extensions.gen_random_bytes(16),'hex'),
  created_at timestamptz not null default now()
);

create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references organizations(id),
  role user_role not null,
  display_name text not null,
  languages text[] not null default '{ar}',
  topics text[] not null default '{}',
  status presence not null default 'offline',
  capacity int not null default 3,
  created_at timestamptz not null default now()
);

create table askers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references organizations(id),
  pseudonym text not null,
  return_code_hash text not null,
  background text,
  language text not null default 'ar',
  created_at timestamptz not null default now(),
  unique (org_id, pseudonym)
);

create table intakes (
  id uuid primary key default gen_random_uuid(),
  asker_id uuid not null references askers(user_id) on delete cascade,
  raw_text text,
  transcript jsonb not null default '[]',
  topic text,
  language text,
  depth depth_level,
  routing_result jsonb,
  generated_by card_origin not null default 'manual',
  status intake_status not null default 'draft',
  created_at timestamptz not null default now()
);

create table conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  asker_id uuid not null references askers(user_id) on delete cascade,
  daee_id uuid references profiles(user_id),
  intake_id uuid references intakes(id),
  topic text,
  status conv_status not null default 'waiting',
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid not null,
  sender_role text not null check (sender_role in ('asker','daee','system')),
  body text not null,
  created_at timestamptz not null default now()
);
create index on messages (conversation_id, created_at);

create table cards (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  asker_id uuid not null references askers(user_id) on delete cascade,
  version int not null default 1,
  generated_by card_origin not null,
  follow_up text,
  covered text,
  remaining text,
  next_step text,
  preferred_daee uuid references profiles(user_id),
  accept_substitute boolean not null default true,
  source_message_ids uuid[] not null default '{}',
  status card_status not null default 'draft',
  edited_major boolean not null default false,
  expires_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table card_access (
  card_id uuid not null references cards(id) on delete cascade,
  viewer_id uuid not null references profiles(user_id) on delete cascade,
  until timestamptz not null,
  primary key (card_id, viewer_id)
);

create table transfers (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  from_daee uuid not null references profiles(user_id),
  to_daee uuid not null references profiles(user_id),
  card_id uuid references cards(id),
  status transfer_status not null default 'pending',
  created_at timestamptz not null default now()
);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  asker_id uuid not null references askers(user_id) on delete cascade,
  daee_id uuid not null references profiles(user_id),
  slot_at timestamptz not null,
  status booking_status not null default 'requested',
  created_at timestamptz not null default now()
);

create table availability (
  id uuid primary key default gen_random_uuid(),
  daee_id uuid not null references profiles(user_id) on delete cascade,
  slot_at timestamptz not null,
  booked boolean not null default false,
  unique (daee_id, slot_at)
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null,
  type text not null,
  payload jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on notifications (recipient_id, read_at);

create table library_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  title text not null,
  body text not null,
  source_name text not null,
  source_url text not null,
  topic text not null,
  level char(1) not null check (level in ('a','b')),
  language text not null
);
create index on library_items (org_id, topic, language);

create table events (
  id bigint generated always as identity primary key,
  org_id uuid not null references organizations(id),
  type text not null,
  conversation_id uuid,
  actor_role text,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on events (org_id, type, created_at);

create table ai_runs (
  id bigint generated always as identity primary key,
  org_id uuid not null references organizations(id),
  task text not null,
  model text,
  input_hash text,
  output jsonb,
  latency_ms int,
  fallback boolean not null default false,
  reason text,
  created_at timestamptz not null default now()
);

-- helpers
create or replace function my_role() returns text language sql stable security definer set search_path = public as $$
  select role::text from profiles where user_id = auth.uid()
$$;
create or replace function is_admin() returns boolean language sql stable set search_path = public as $$ select my_role() = 'admin' $$;
create or replace function is_daee()  returns boolean language sql stable set search_path = public as $$ select my_role() = 'daee' $$;
create or replace function is_asker() returns boolean language sql stable set search_path = public as $$ select exists (select 1 from askers where user_id = auth.uid()) $$;
-- security definer: reads card_access without its RLS, which would read cards again (recursion)
create or replace function can_view_card(c uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from card_access where card_id = c and viewer_id = auth.uid() and until > now())
$$;

-- RLS
alter table organizations enable row level security;
alter table profiles enable row level security;
alter table askers enable row level security;
alter table intakes enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table cards enable row level security;
alter table card_access enable row level security;
alter table transfers enable row level security;
alter table bookings enable row level security;
alter table availability enable row level security;
alter table notifications enable row level security;
alter table library_items enable row level security;
alter table events enable row level security;
alter table ai_runs enable row level security;

create policy org_read on organizations for select to authenticated using (true);
create policy org_admin on organizations for update to authenticated using (is_admin());

create policy profiles_read on profiles for select to authenticated using (true);
create policy profiles_self on profiles for update to authenticated using (user_id = auth.uid() or is_admin());

create policy askers_self on askers for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy askers_staff_read on askers for select to authenticated using (is_daee());

create policy intakes_self on intakes for all to authenticated using (asker_id = auth.uid()) with check (asker_id = auth.uid());
create policy intakes_daee on intakes for select to authenticated using (is_daee());

create policy conv_asker on conversations for all to authenticated using (asker_id = auth.uid()) with check (asker_id = auth.uid());
create policy conv_daee on conversations for all to authenticated using (is_daee());
create policy conv_admin on conversations for select to authenticated using (is_admin());

-- admin is intentionally excluded from messages
create policy msg_participants on messages for select to authenticated using (
  exists (select 1 from conversations c where c.id = messages.conversation_id and (c.asker_id = auth.uid() or c.daee_id = auth.uid()))
  or exists (select 1 from transfers t where t.conversation_id = messages.conversation_id and t.to_daee = auth.uid() and t.status = 'accepted')
);
create policy msg_insert on messages for insert to authenticated with check (
  messages.sender_id = auth.uid() and exists (select 1 from conversations c where c.id = messages.conversation_id and (c.asker_id = auth.uid() or c.daee_id = auth.uid()))
);

create policy cards_asker on cards for all to authenticated using (asker_id = auth.uid()) with check (asker_id = auth.uid());
create policy cards_viewer on cards for select to authenticated using (cards.status = 'approved' and can_view_card(cards.id));
create policy cards_reviewer on cards for select to authenticated using (
  exists (select 1 from conversations c where c.id = cards.conversation_id and c.daee_id = auth.uid())
);
create policy cards_review_update on cards for update to authenticated using (
  cards.status = 'draft' and exists (select 1 from conversations c where c.id = cards.conversation_id and c.daee_id = auth.uid())
);

create policy access_asker on card_access for all to authenticated using (
  exists (select 1 from cards k where k.id = card_access.card_id and k.asker_id = auth.uid())
);
create policy access_viewer on card_access for select to authenticated using (viewer_id = auth.uid());

create policy transfers_daee on transfers for all to authenticated using (from_daee = auth.uid() or to_daee = auth.uid());
create policy transfers_admin on transfers for select to authenticated using (is_admin());

create policy bookings_asker on bookings for all to authenticated using (asker_id = auth.uid()) with check (asker_id = auth.uid());
create policy bookings_daee on bookings for all to authenticated using (daee_id = auth.uid());
create policy availability_read on availability for select to authenticated using (true);
create policy availability_own on availability for all to authenticated using (daee_id = auth.uid());

create policy notif_own on notifications for all to authenticated using (recipient_id = auth.uid());
create policy library_read on library_items for select to authenticated using (true);
create policy library_admin on library_items for all to authenticated using (is_admin());
create policy events_admin on events for select to authenticated using (is_admin());
create policy ai_runs_admin on ai_runs for select to authenticated using (is_admin());

-- realtime
alter publication supabase_realtime add table messages, notifications, conversations, transfers;