-- Master cards have no conversation: a daee's organization is matched through the asker.
create or replace function can_view_card(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from cards k
      join askers a on a.user_id = k.asker_id
      join profiles p on p.user_id = auth.uid() and p.role = 'daee' and p.org_id = a.org_id
     where k.id = c
       and k.status = 'approved'
       and k.deleted_at is null
       and (k.expires_at is null or k.expires_at > now())
       and is_active_staff(auth.uid())
       and (
         k.visibility = 'team'
         or exists (select 1 from card_access x where x.card_id = k.id and x.viewer_id = auth.uid() and x.until > now())
       )
  )
$$;
