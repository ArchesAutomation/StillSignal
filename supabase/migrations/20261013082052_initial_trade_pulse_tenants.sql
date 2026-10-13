-- Run once in a NEW Supabase project. Service role is server-only.
begin;
create table public.pulse_sessions (
 id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 started_at bigint not null, data jsonb not null check(jsonb_typeof(data)='object'),
 updated_at timestamptz not null default now(), unique(id,user_id)
);
create index pulse_sessions_user_time on public.pulse_sessions(user_id,started_at desc);
create table public.pulse_sample_chunks (
 seq bigint generated always as identity primary key, id uuid unique not null,
 session_id uuid not null, user_id uuid not null, samples jsonb not null,
 foreign key(session_id,user_id) references public.pulse_sessions(id,user_id) on delete cascade,
 check(jsonb_typeof(samples)='array' and jsonb_array_length(samples) between 1 and 120)
);
create index pulse_chunks_session_seq on public.pulse_sample_chunks(user_id,session_id,seq);
create table public.pulse_events (
 id text not null check(length(id) between 1 and 160), session_id uuid not null, user_id uuid not null,
 occurred_at bigint not null, data jsonb not null, primary key(session_id,id),
 foreign key(session_id,user_id) references public.pulse_sessions(id,user_id) on delete cascade
);
create index pulse_events_session_time on public.pulse_events(user_id,session_id,occurred_at);
create table public.pulse_hooks (
 session_id uuid primary key, user_id uuid not null, token_hash text unique not null, expires_at timestamptz not null,
 foreign key(session_id,user_id) references public.pulse_sessions(id,user_id) on delete cascade
);
create table public.pulse_deleted_sessions(id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade);
create index pulse_deleted_user on public.pulse_deleted_sessions(user_id);
alter table public.pulse_deleted_sessions enable row level security;
revoke all on public.pulse_deleted_sessions from anon,authenticated;
grant all on public.pulse_deleted_sessions to service_role;
create table public.pulse_rate_limits (key text primary key, bucket bigint not null, count integer not null);
-- Client tokens can only read their own data. All mutations go through authenticated, bounded API routes.
alter table public.pulse_sessions enable row level security;
alter table public.pulse_sample_chunks enable row level security;
alter table public.pulse_events enable row level security;
alter table public.pulse_hooks enable row level security;
alter table public.pulse_rate_limits enable row level security;
create policy own_sessions on public.pulse_sessions for select to authenticated using(user_id=(select auth.uid()));
create policy own_samples on public.pulse_sample_chunks for select to authenticated using(user_id=(select auth.uid()));
create policy own_events on public.pulse_events for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.pulse_sessions,public.pulse_sample_chunks,public.pulse_events,public.pulse_hooks,public.pulse_rate_limits from anon,authenticated;
grant select on public.pulse_sessions,public.pulse_sample_chunks,public.pulse_events to authenticated;
grant all on public.pulse_sessions,public.pulse_sample_chunks,public.pulse_events,public.pulse_hooks,public.pulse_rate_limits to service_role;
grant usage,select on sequence public.pulse_sample_chunks_seq_seq to service_role;
create function public.pulse_rate_limit(p_key text,p_limit integer) returns boolean language plpgsql security invoker set search_path=public as $$
declare n integer; b bigint:=floor(extract(epoch from now())/60);
begin
 insert into pulse_rate_limits(key,bucket,count) values(p_key,b,1)
 on conflict(key) do update set bucket=b,count=case when pulse_rate_limits.bucket=b then pulse_rate_limits.count+1 else 1 end returning count into n;
 return n<=p_limit;
end;$$;
create function public.pulse_save_session(p_user uuid,p_id uuid,p_data jsonb) returns void language plpgsql security invoker set search_path=public as $$
begin
 if exists(select 1 from pulse_deleted_sessions where id=p_id) then raise exception 'session deleted';end if;
 if p_data->>'owner'<>p_user::text or p_data->>'id'<>p_id::text then raise exception 'invalid owner';end if;
 insert into pulse_sessions(id,user_id,started_at,data) values(p_id,p_user,(p_data->>'startedAt')::bigint,p_data)
 on conflict(id) do update set data=excluded.data || jsonb_build_object(
 'events',(select coalesce(jsonb_agg(v),'[]'::jsonb) from (select distinct on (v->>'id') v from jsonb_array_elements((pulse_sessions.data->'events') || (excluded.data->'events')) v) items),
 'journal',(select coalesce(jsonb_agg(v),'[]'::jsonb) from (select distinct on (v->>'id') v from jsonb_array_elements((pulse_sessions.data->'journal') || (excluded.data->'journal')) v) items),
 'sampleCount',greatest((pulse_sessions.data->>'sampleCount')::integer,(excluded.data->>'sampleCount')::integer)
 ) || case when pulse_sessions.data ? 'endedAt' then jsonb_build_object('endedAt',pulse_sessions.data->'endedAt') else '{}'::jsonb end,
 updated_at=now() where pulse_sessions.user_id=p_user and pulse_sessions.started_at=(p_data->>'startedAt')::bigint;
 if not found then raise exception 'session ownership mismatch';end if;
end;$$;
create function public.pulse_ingest_batch(p_user uuid,p_session uuid,p_id uuid,p_samples jsonb) returns void language plpgsql security invoker set search_path=public as $$
declare existing pulse_sample_chunks;
begin
 if not exists(select 1 from pulse_sessions where id=p_session and user_id=p_user) then raise exception 'session not found';end if;
 if jsonb_typeof(p_samples)<>'array' or jsonb_array_length(p_samples) not between 1 and 120 then raise exception 'invalid batch';end if;
 if exists(select 1 from jsonb_array_elements(p_samples) x where not(x ? 'bpm' and x ? 't') or (x->>'bpm')::numeric not between 25 and 240 or (x->>'t')::numeric<0) then raise exception 'invalid sample';end if;
 insert into pulse_sample_chunks(id,session_id,user_id,samples) values(p_id,p_session,p_user,p_samples) on conflict(id) do nothing;
 if not found then
 select * into existing from pulse_sample_chunks where id=p_id;
 if existing.user_id<>p_user or existing.session_id<>p_session or existing.samples<>p_samples then raise exception 'idempotency conflict';end if;
 end if;
end;$$;
create function public.pulse_delete_session(p_user uuid,p_id uuid) returns void language plpgsql security invoker set search_path=public as $$
begin
 if not exists(select 1 from pulse_sessions where id=p_id and user_id=p_user) then raise exception 'session not found';end if;
 insert into pulse_deleted_sessions(id,user_id) values(p_id,p_user) on conflict do nothing;
 delete from pulse_sessions where id=p_id and user_id=p_user;
end;$$;
revoke all on function public.pulse_delete_session(uuid,uuid) from public,anon,authenticated;
grant execute on function public.pulse_delete_session(uuid,uuid) to service_role;
revoke all on function public.pulse_rate_limit(text,integer),public.pulse_save_session(uuid,uuid,jsonb),public.pulse_ingest_batch(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pulse_rate_limit(text,integer),public.pulse_save_session(uuid,uuid,jsonb),public.pulse_ingest_batch(uuid,uuid,uuid,jsonb) to service_role;
create index pulse_chunks_parent_owner on public.pulse_sample_chunks(session_id,user_id);
create index pulse_events_parent_owner on public.pulse_events(session_id,user_id);
create index pulse_hooks_parent_owner on public.pulse_hooks(session_id,user_id);
commit;
