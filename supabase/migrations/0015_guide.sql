-- The asker guide: the confirmed summary of the question and its level (a to d; d means a
-- personal ruling is being requested, which needs a specialist).
alter table conversations
  add column guide_summary text,
  add column level char(1) check (level in ('a', 'b', 'c', 'd'));
