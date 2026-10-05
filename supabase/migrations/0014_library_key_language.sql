-- A library item is keyed by item_key and language: the same passage exists per language.
drop index if exists library_items_key;
create unique index library_items_key on library_items (org_id, item_key, language) where item_key is not null;
