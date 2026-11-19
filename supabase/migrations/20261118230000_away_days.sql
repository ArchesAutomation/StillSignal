-- Additive storage for days deliberately spent away from live trading.
-- Each row is one immutable change, so offline devices merge without revision conflicts.
-- Nothing here touches pulse_sessions or trading_days: an away day is not a trading session.
begin;
create table public.away_day_events(
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 seq bigint generated always as identity unique,
 received_at timestamptz not null default clock_timestamp(),
 data jsonb not null check(
  jsonb_typeof(data)='object' and jsonb_typeof(data->'body')='object'
  and octet_length(data::text)<=256000 and (data->>'id')::uuid=id
 )
);
create index away_day_events_owner_seq on public.away_day_events(user_id,seq);
alter table public.away_day_events enable row level security;
create policy own_away_days on public.away_day_events for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.away_day_events from public,anon,authenticated,service_role;
grant select on public.away_day_events to authenticated;
grant select,insert on public.away_day_events to service_role;

create function public.pulse_away_append(p_user uuid,p_events jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare e jsonb; saved jsonb; saved_user uuid;
begin
 if jsonb_typeof(p_events)<>'array' or jsonb_array_length(p_events) not between 1 and 40 then raise exception 'invalid away batch'; end if;
 for e in select * from jsonb_array_elements(p_events) loop
  insert into public.away_day_events(id,user_id,data) values((e->>'id')::uuid,p_user,e) on conflict(id) do nothing;
  select data,user_id into saved,saved_user from public.away_day_events where id=(e->>'id')::uuid;
  if saved_user<>p_user or saved<>e then raise exception 'idempotency conflict'; end if;
 end loop;
end $$;
revoke all on function public.pulse_away_append(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pulse_away_append(uuid,jsonb) to service_role;

-- Away screenshots have no session folder. Existing read and delete policies already cover the owner's folder.
create policy pulse_away_screenshot_upload on storage.objects for insert to authenticated
with check(
 bucket_id='pulse-screenshots' and (storage.foldername(name))[1]=(select auth.uid())::text
 and (storage.foldername(name))[2]='away-days' and array_length(storage.foldername(name),1)=2
);
commit;
