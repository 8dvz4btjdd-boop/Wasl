-- Readings tailored to the question: cached by the normalized need (sha256), the extended
-- verbatim passage with its hash, and what each asker was shown (for their daee).

alter table library_items
  add column need_hash text,
  add column passage_hash text;
create index on library_items (org_id, need_hash, language) where need_hash is not null;
drop index if exists library_items_auto_url;
create unique index library_items_auto_need on library_items (org_id, need_hash, language, source_url, md5(body)) where verified_by = 'auto';

-- The readings shown to the asker for a conversation. Service role only: the assigned daee
-- reads them through a server action that checks the assignment.
create table conversation_readings (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references conversations(id) on delete cascade,
  items jsonb not null,
  need_hash text,
  created_at timestamptz not null default now()
);
create index on conversation_readings (conversation_id, created_at desc);
alter table conversation_readings enable row level security;
