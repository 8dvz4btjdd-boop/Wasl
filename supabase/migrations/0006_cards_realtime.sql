-- Approved cards reach the daee panel live. Realtime applies cards RLS, so only daee who
-- can view a card (can_view_card) receive it; drafts stay with the asker.
alter publication supabase_realtime add table cards;
