-- Recommendations must not use a client-supplied created_at to grant access to a
-- transferred segment. Keep legacy rows NULL: their actual receipt time is unknown.
-- This does not change chat's existing created_at or edit any historical content.
alter table public.messages add column received_at timestamptz;

create function public.messages_set_trusted_receipt()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    -- Explicit client/service values cannot backdate or future-date a new receipt.
    new.received_at := clock_timestamp();
  elsif new.received_at is distinct from old.received_at then
    raise exception 'message receipt is immutable';
  end if;
  return new;
end;
$$;
create trigger messages_trusted_receipt before insert or update of received_at on public.messages
  for each row execute function public.messages_set_trusted_receipt();
revoke all on function public.messages_set_trusted_receipt() from public, anon, authenticated;
