-- Approved-sources engine: pages seen by the live search, and the library extended to
-- hold verbatim citations (verified by a human, or automatically by the fence).

create table source_pages (
  url text primary key,
  title text,
  domain text not null,
  fetched_at timestamptz not null default now()
);
alter table source_pages enable row level security;
create policy source_pages_admin on source_pages for select to authenticated using (is_admin());

alter table library_items
  add column verified_by text not null default 'human' check (verified_by in ('human', 'auto')),
  add column cited_text text,
  add column item_key text,
  add column asker_ok boolean not null default true,
  add column created_at timestamptz not null default now();
alter table library_items drop constraint if exists library_items_level_check;
alter table library_items add constraint library_items_level_check check (level in ('a', 'b', 'c', 'd'));
create unique index library_items_key on library_items (org_id, item_key) where item_key is not null;
create unique index library_items_auto_url on library_items (org_id, topic, language, source_url, md5(body)) where verified_by = 'auto';
create index on library_items (org_id, topic, language, verified_by);
