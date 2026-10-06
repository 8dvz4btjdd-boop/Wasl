-- How many return codes the asker has been shown. The first code is created silently at
-- entry (never displayed); from the second reveal on, the asker is told the previous code
-- stops working.
alter table askers add column codes_revealed int not null default 0;
