begin;
create table public.pulse_connections (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 provider text not null default 'tradingview' check(provider='tradingview'),
 token_hash text unique not null,
 timezone text not null,
 expires_at timestamptz not null,
 created_at timestamptz not null default now(),
 last_received_at timestamptz,
 event_count integer not null default 0,
 unique(user_id,provider)
);
alter table public.pulse_connections enable row level security;
revoke all on public.pulse_connections from public,anon,authenticated;
grant all on public.pulse_connections to service_role;
create function public.pulse_receive_tradingview(p_hash text,p_session jsonb,p_events jsonb) returns integer
language plpgsql security invoker set search_path=public as $$
declare c pulse_connections; s pulse_sessions; e jsonb; merged jsonb; inserted integer:=0; n integer; sid uuid;
begin
 select * into c from pulse_connections where token_hash=p_hash and expires_at>now() for update;
 if not found then raise exception 'connection revoked';end if;
 if p_session->>'owner' is distinct from c.user_id::text or p_session->>'source'<>'tradingview' then raise exception 'invalid owner';end if;
 if jsonb_typeof(p_events)<>'array' or jsonb_array_length(p_events) not between 1 and 2 then raise exception 'invalid events';end if;
 sid:=(p_session->>'id')::uuid;
 if exists(select 1 from pulse_deleted_sessions where id=sid) then raise exception 'session deleted';end if;
 insert into pulse_sessions(id,user_id,started_at,data) values(sid,c.user_id,(p_session->>'startedAt')::bigint,p_session) on conflict(id) do nothing;
 select * into s from pulse_sessions where id=sid and user_id=c.user_id for update;
 if not found then raise exception 'invalid owner';end if;
 for e in select value from jsonb_array_elements(p_events) loop
  if (e->>'t')::bigint<s.started_at or (e->>'t')::bigint>(s.data->>'endedAt')::bigint or (e->>'t')::bigint>extract(epoch from now())*1000+300000 then raise exception 'outside journal day';end if;
  if exists(select 1 from pulse_events where session_id=sid and id=e->>'id' and data<>e) or exists(select 1 from jsonb_array_elements(s.data->'events') v where v->>'id'=e->>'id' and v<>e) then raise exception 'event id conflict';end if;
  insert into pulse_events(id,session_id,user_id,occurred_at,data) values(e->>'id',sid,c.user_id,(e->>'t')::bigint,e) on conflict(session_id,id) do nothing;
  get diagnostics n=row_count;inserted:=inserted+n;
 end loop;
 select coalesce(jsonb_agg(v order by (v->>'t')::bigint,v->>'id'),'[]'::jsonb) into merged from (
   select distinct on(v->>'id') v from jsonb_array_elements((s.data->'events')||p_events) v
 ) items;
 if jsonb_array_length(merged)>5000 then raise exception 'journal full';end if;
 update pulse_sessions set data=jsonb_set(data,'{events}',merged),updated_at=now() where id=sid and user_id=c.user_id;
 update pulse_connections set last_received_at=now(),event_count=event_count+inserted where id=c.id;
 return inserted;
end;$$;
revoke all on function public.pulse_receive_tradingview(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.pulse_receive_tradingview(text,jsonb,jsonb) to service_role;
commit;
