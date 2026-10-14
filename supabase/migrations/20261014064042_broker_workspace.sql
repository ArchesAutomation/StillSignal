begin;
-- Additive only. pulse_connections remains dedicated to TradingView.
create table public.pulse_broker_connections (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 provider text not null check(provider in ('snaptrade','tradestation','tradovate','ibkr','projectx','rithmic','oanda')),
 status text not null default 'pending' check(status in ('pending','connected','disabled','revoked','error')),
 environment text not null default 'live' check(environment in ('live','paper')), capabilities jsonb not null default '{}',
 last_sync_at timestamptz, error_code text, created_at timestamptz not null default now(), unique(user_id,id),unique(user_id,provider,environment)
);
create table public.pulse_broker_secrets (
 connection_id uuid primary key references public.pulse_broker_connections(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, ciphertext text not null,
 updated_at timestamptz not null default now(),
 foreign key(user_id,connection_id) references public.pulse_broker_connections(user_id,id)
);
create table public.pulse_broker_accounts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 connection_id uuid not null, provider_account_id text not null, canonical_key text not null,
 institution text not null, name text not null, currency text not null check(currency ~ '^[A-Z]{3}$'),
 environment text not null check(environment in ('live','paper')), identity_verified boolean not null default false,
 enabled boolean not null default true, metadata jsonb not null default '{}',
 unique(user_id,canonical_key), unique(user_id,id),
 foreign key(user_id,connection_id) references public.pulse_broker_connections(user_id,id)
);
-- Raw trades and market records never enter Session JSON or the HR sample outbox.
create table public.pulse_broker_executions (
 id text primary key, user_id uuid not null, account_id uuid not null, provider_execution_id text not null,
 session_id uuid not null, revision bigint not null, payload_hash text not null, raw jsonb not null,
 events jsonb not null, received_at timestamptz not null default now(),
 unique(user_id,account_id,provider_execution_id),
 foreign key(user_id,account_id) references public.pulse_broker_accounts(user_id,id)
);
create table public.pulse_broker_jobs (
 id uuid primary key default gen_random_uuid(), user_id uuid not null, account_id uuid not null,
 state text not null default 'queued' check(state in ('queued','leased','paused')),
 cursor jsonb not null default '{}', checkpoint jsonb not null default '{}', attempts integer not null default 0,
 run_after timestamptz not null default now(), lease uuid, leased_until timestamptz, error_code text,
 unique(user_id,account_id), foreign key(user_id,account_id) references public.pulse_broker_accounts(user_id,id)
);
create table public.pulse_deleted_broker_executions(
 user_id uuid not null references auth.users(id) on delete cascade,id text not null,account_id uuid not null,
 deleted_at timestamptz not null default now(),primary key(user_id,id),
 foreign key(user_id,account_id) references public.pulse_broker_accounts(user_id,id)
);
create index pulse_broker_jobs_due on public.pulse_broker_jobs(run_after) where state <> 'paused';
create index pulse_broker_executions_account_time on public.pulse_broker_executions(user_id,account_id,received_at);
create table public.pulse_broker_oauth (
 state_hash text primary key, user_id uuid not null, connection_id uuid not null,
 expires_at timestamptz not null, verifier_ciphertext text,
 foreign key(user_id,connection_id) references public.pulse_broker_connections(user_id,id)
);
create table public.pulse_broker_discovery (
 connection_id uuid primary key, user_id uuid not null, state text not null default 'queued' check(state in ('queued','leased','paused')),
 run_after timestamptz not null default now(), lease uuid, leased_until timestamptz, attempts integer not null default 0,error_code text,
 foreign key(user_id,connection_id) references public.pulse_broker_connections(user_id,id)
);
create table public.pulse_broker_receipts (
 user_id uuid not null references auth.users(id) on delete cascade, provider text not null, id text not null,
 event_type text not null, received_at timestamptz not null default now(), primary key(user_id,provider,id)
);
create function public.pulse_claim_broker_discovery(p_lease uuid) returns setof public.pulse_broker_discovery
language sql security invoker set search_path=public as $$
 with candidate as (
  select d.connection_id from pulse_broker_discovery d join pulse_broker_connections c on c.id=d.connection_id and c.user_id=d.user_id
  where d.state<>'paused' and d.run_after<=now() and (d.leased_until is null or d.leased_until<now()) and c.status<>'revoked'
  order by d.run_after for update of d skip locked limit 1
 )
 update pulse_broker_discovery d set state='leased',lease=p_lease,leased_until=now()+interval '5 minutes'
 from candidate c where d.connection_id=c.connection_id returning d.*;
$$;
create function public.pulse_accept_broker_receipt(p_user uuid,p_id text,p_type text) returns boolean
language plpgsql security invoker set search_path=public as $$
declare n integer;c uuid;
begin
 insert into pulse_broker_receipts(user_id,provider,id,event_type)values(p_user,'snaptrade',p_id,p_type)on conflict do nothing;
 get diagnostics n=row_count;if n=0 then return false;end if;
 select id into c from pulse_broker_connections where user_id=p_user and provider='snaptrade' and status<>'revoked' for update;
 if c is not null then
  insert into pulse_broker_discovery(user_id,connection_id) values(p_user,c)
  on conflict(connection_id)do update set state=case when pulse_broker_discovery.state='leased' then 'leased' else 'queued' end,run_after=now(),error_code=null;
 end if;
 return true;
end;$$;
create function public.pulse_consume_broker_oauth(p_hash text) returns setof public.pulse_broker_oauth
language sql security invoker set search_path=public as $$
 delete from pulse_broker_oauth where state_hash=p_hash and expires_at>now() returning *;
$$;
create table public.pulse_market_entitlements (
 user_id uuid not null references auth.users(id) on delete cascade, provider text not null,
 display_allowed boolean not null default false, storage_allowed boolean not null default false,
 analytics_allowed boolean not null default false, redistribution_allowed boolean not null default false,
 instruments text[] not null default '{}', expires_at timestamptz not null, agreement_ref text not null,
 primary key(user_id,provider)
);
create table public.pulse_market_cache (
 user_id uuid not null references auth.users(id) on delete cascade, provider text not null,
 instrument_id text not null, interval_seconds integer not null, start_ms bigint not null,
 candles jsonb not null, expires_at timestamptz not null,
 primary key(user_id,provider,instrument_id,interval_seconds,start_ms)
);
create table public.pulse_instruments (
 user_id uuid not null references auth.users(id) on delete cascade, id text not null,
 data jsonb not null, primary key(user_id,id)
);
do $$ declare t text; begin
 foreach t in array array['pulse_broker_connections','pulse_broker_secrets','pulse_broker_accounts','pulse_broker_executions','pulse_deleted_broker_executions','pulse_broker_jobs','pulse_broker_oauth','pulse_broker_discovery','pulse_broker_receipts','pulse_market_entitlements','pulse_market_cache','pulse_instruments'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
 foreach t in array array['pulse_broker_connections','pulse_broker_accounts','pulse_instruments'] loop
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy tenant_read on public.%I for select to authenticated using((select auth.uid())=user_id)',t);
 end loop;
end $$;

create function public.pulse_claim_broker_job(p_lease uuid) returns setof public.pulse_broker_jobs
language plpgsql security invoker set search_path=public as $$
begin
 return query
 with candidate as (
  select j.id from pulse_broker_jobs j
  join pulse_broker_accounts a on a.id=j.account_id and a.user_id=j.user_id
  join pulse_broker_connections c on c.id=a.connection_id and c.user_id=a.user_id
  where j.state<>'paused' and j.run_after<=now() and (j.leased_until is null or j.leased_until<now())
   and a.enabled and a.identity_verified and c.status='connected'
  order by j.run_after for update of j skip locked limit 1
 )
 update pulse_broker_jobs j set state='leased',lease=p_lease,leased_until=now()+interval '90 seconds'
 from candidate c where j.id=c.id returning j.*;
end;$$;

-- Intake, journal JSON, pulse_events, and checkpoint commit in ONE transaction.
create function public.pulse_ingest_broker_page(p_user uuid,p_account uuid,p_job uuid,p_lease uuid,p_records jsonb,p_cursor jsonb,p_complete boolean)
returns integer language plpgsql security invoker set search_path=public as $$
declare a pulse_broker_accounts; c pulse_broker_connections; job pulse_broker_jobs;
 r jsonb; e jsonb; s jsonb; old pulse_broker_executions; sid uuid; inserted integer:=0; touched uuid[]:='{}'; merged jsonb;
begin
 select * into a from pulse_broker_accounts where id=p_account and user_id=p_user for update;
 if not found or not a.enabled or not a.identity_verified then raise exception 'account unavailable';end if;
 select * into c from pulse_broker_connections where id=a.connection_id and user_id=p_user for update;
 if not found or c.status<>'connected' then raise exception 'connection unavailable';end if;
 select * into job from pulse_broker_jobs where id=p_job and user_id=p_user and account_id=p_account and lease=p_lease and state='leased' and leased_until>now() for update;
 if not found then raise exception 'lease expired';end if;
 if jsonb_typeof(p_records)<>'array' or jsonb_array_length(p_records)>250 then raise exception 'invalid page';end if;
 for r in select value from jsonb_array_elements(p_records) loop
  if exists(select 1 from pulse_deleted_broker_executions where user_id=p_user and id=r->>'id')then continue;end if;
  s:=r->'session'; sid:=(s->>'id')::uuid;
  if s->>'owner' is distinct from p_user::text or s->>'source'<>'journal' then raise exception 'invalid owner';end if;
  if jsonb_typeof(r->'events')<>'array' or jsonb_array_length(r->'events') not between 1 and 2 then raise exception 'invalid events';end if;
  for e in select value from jsonb_array_elements(r->'events') loop
   if e->>'source'<>'broker' or e->'broker'->>'accountId' is distinct from p_account::text
     or e->'broker'->>'connectionId' is distinct from a.connection_id::text
     or e->'broker'->>'provider' is distinct from c.provider
     or (e->>'t')::bigint<(s->>'startedAt')::bigint or (e->>'t')::bigint>(s->>'endedAt')::bigint then raise exception 'invalid broker event';end if;
  end loop;
  select * into old from pulse_broker_executions where id=r->>'id' for update;
  if found then
   if old.user_id<>p_user or old.account_id<>p_account then raise exception 'execution ownership mismatch';end if;
   if old.payload_hash=r->>'hash' or old.revision>(r->>'revision')::bigint then continue;end if;
   if old.revision=(r->>'revision')::bigint and old.payload_hash<>r->>'hash' then raise exception 'revision conflict';end if;
   touched:=array_append(touched,old.session_id);
   delete from pulse_events where user_id=p_user and session_id=old.session_id and id in(select v->>'id' from jsonb_array_elements(old.events) v);
  end if;
  -- A deleted daily journal cannot be resurrected by polling.
  if exists(select 1 from pulse_deleted_sessions where id=sid) then continue;end if;
  insert into pulse_sessions(id,user_id,started_at,data) values(sid,p_user,(s->>'startedAt')::bigint,s) on conflict(id) do nothing;
  perform 1 from pulse_sessions where id=sid and user_id=p_user for update;
  if not found then raise exception 'session ownership mismatch';end if;
  for e in select value from jsonb_array_elements(r->'events') loop
   if e->>'source'<>'broker' or e->'broker'->>'accountId' is distinct from p_account::text
     or e->'broker'->>'connectionId' is distinct from a.connection_id::text
     or e->'broker'->>'provider' is distinct from c.provider
     or (e->>'t')::bigint<(s->>'startedAt')::bigint or (e->>'t')::bigint>(s->>'endedAt')::bigint then raise exception 'invalid broker event';end if;
   insert into pulse_events(id,session_id,user_id,occurred_at,data) values(e->>'id',sid,p_user,(e->>'t')::bigint,e)
    on conflict(session_id,id) do update set data=excluded.data,occurred_at=excluded.occurred_at where pulse_events.user_id=p_user;
  end loop;
  insert into pulse_broker_executions(id,user_id,account_id,provider_execution_id,session_id,revision,payload_hash,raw,events)
   values(r->>'id',p_user,p_account,r->'events'->0->'broker'->>'executionId',sid,(r->>'revision')::bigint,r->>'hash',r->'raw',r->'events')
   on conflict(id) do update set session_id=excluded.session_id,revision=excluded.revision,payload_hash=excluded.payload_hash,raw=excluded.raw,events=excluded.events,received_at=now();
  touched:=array_append(touched,sid); inserted:=inserted+1;
 end loop;
 foreach sid in array touched loop
  select coalesce(jsonb_agg(v order by (v->>'t')::bigint,v->>'id'),'[]'::jsonb) into merged from (
   select v from pulse_sessions ps,jsonb_array_elements(ps.data->'events') v where ps.id=sid and ps.user_id=p_user and v->>'source'<>'broker'
   union all select data from pulse_events where session_id=sid and user_id=p_user and data->>'source'='broker'
  ) q;
  if jsonb_array_length(merged)>5000 then raise exception 'journal full';end if;
  update pulse_sessions set data=jsonb_set(data,'{events}',merged),updated_at=now() where id=sid and user_id=p_user;
 end loop;
 update pulse_broker_jobs set cursor=p_cursor,checkpoint=case when p_complete then p_cursor else checkpoint end,
  state='queued',lease=null,leased_until=null,attempts=0,error_code=null,
  run_after=now()+case when p_complete then case when c.provider='snaptrade' then interval '6 hours' else interval '60 seconds' end else interval '1 second' end
  where id=p_job;
 update pulse_broker_connections set last_sync_at=now(),error_code=null where id=c.id;
 return inserted;
end;$$;

create or replace function public.pulse_delete_session(p_user uuid,p_id uuid) returns void
language plpgsql security invoker set search_path=public as $$
begin
 perform 1 from pulse_sessions where id=p_id and user_id=p_user for update;
 if not found then raise exception 'session not found';end if;
 insert into pulse_deleted_broker_executions(user_id,id,account_id)
  select user_id,id,account_id from pulse_broker_executions where user_id=p_user and session_id=p_id on conflict do nothing;
 delete from pulse_broker_executions where user_id=p_user and session_id=p_id;
 insert into pulse_deleted_sessions(id,user_id)values(p_id,p_user)on conflict do nothing;
 delete from pulse_sessions where id=p_id and user_id=p_user;
end;$$;

-- Reject client-created broker records, and prefer canonical broker amendments on stale saves.
create or replace function public.pulse_save_session(p_user uuid,p_id uuid,p_data jsonb) returns void
language plpgsql security invoker set search_path=public as $$
declare merged_notes jsonb; existing pulse_sessions; merged_events jsonb;
begin
 if exists(select 1 from pulse_deleted_sessions where id=p_id) then raise exception 'session deleted';end if;
 if p_data->>'owner' is distinct from p_user::text or p_data->>'id' is distinct from p_id::text then raise exception 'invalid owner';end if;
 -- Client broker copies are discarded entirely; only canonical server records are projected.
 insert into pulse_sessions(id,user_id,started_at,data) values(p_id,p_user,(p_data->>'startedAt')::bigint,p_data) on conflict(id) do nothing;
 select * into existing from pulse_sessions where id=p_id and user_id=p_user for update;
 if not found or existing.started_at<>(p_data->>'startedAt')::bigint then raise exception 'session ownership mismatch';end if;
 select coalesce(jsonb_agg(v order by (v->>'t')::bigint,v->>'id'),'[]'::jsonb) into merged_notes from (
  select distinct on(v->>'id') v from jsonb_array_elements((existing.data->'journal')||(p_data->'journal')) v
  order by v->>'id',greatest(coalesce((v->>'updatedAt')::bigint,(v->>'t')::bigint),coalesce((v->>'deletedAt')::bigint,0)) desc,(v ? 'deletedAt') desc
 ) items;
 select coalesce(jsonb_agg(v order by (v->>'t')::bigint,v->>'id'),'[]'::jsonb) into merged_events from (
  select distinct on(v->>'id') v from (
   select v from jsonb_array_elements((existing.data->'events')||(p_data->'events')) v where v->>'source'<>'broker'
   union all select data from pulse_events where session_id=p_id and user_id=p_user and data->>'source'='broker'
  ) q
 ) items;
 if jsonb_array_length(merged_notes)>1000 or jsonb_array_length(merged_events)>5000 then raise exception 'journal full';end if;
 update pulse_sessions set data=p_data||jsonb_build_object('events',merged_events,'journal',merged_notes,'sampleCount',greatest((existing.data->>'sampleCount')::integer,(p_data->>'sampleCount')::integer))
  ||case when existing.data ? 'endedAt' then jsonb_build_object('endedAt',existing.data->'endedAt') else '{}'::jsonb end,
  updated_at=now() where id=p_id and user_id=p_user;
end;$$;
revoke all on function public.pulse_claim_broker_job(uuid) from public,anon,authenticated;
revoke all on function public.pulse_consume_broker_oauth(text) from public,anon,authenticated;
revoke all on function public.pulse_claim_broker_discovery(uuid) from public,anon,authenticated;
revoke all on function public.pulse_accept_broker_receipt(uuid,text,text) from public,anon,authenticated;
revoke all on function public.pulse_ingest_broker_page(uuid,uuid,uuid,uuid,jsonb,jsonb,boolean) from public,anon,authenticated;
revoke all on function public.pulse_save_session(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.pulse_delete_session(uuid,uuid) from public,anon,authenticated;
grant execute on function public.pulse_claim_broker_job(uuid) to service_role;
grant execute on function public.pulse_consume_broker_oauth(text) to service_role;
grant execute on function public.pulse_claim_broker_discovery(uuid) to service_role;
grant execute on function public.pulse_accept_broker_receipt(uuid,text,text) to service_role;
grant execute on function public.pulse_ingest_broker_page(uuid,uuid,uuid,uuid,jsonb,jsonb,boolean) to service_role;
grant execute on function public.pulse_save_session(uuid,uuid,jsonb) to service_role;
grant execute on function public.pulse_delete_session(uuid,uuid) to service_role;
commit;
