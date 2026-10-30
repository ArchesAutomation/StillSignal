-- Additive process domain. Existing sessions, executions and HR chunks are unchanged.
-- Each row is an immutable version. Steps/rules are pinned within their definition
-- version so changing a template never rewrites an actual run or assessment.
begin;
create function public.pulse_process_table(p_kind text) returns text
language sql immutable security invoker set search_path='' as $$
 select case p_kind
 when 'day' then 'trading_days' when 'protocol' then 'protocol_templates'
 when 'run' then 'protocol_runs' when 'response' then 'protocol_responses'
 when 'thesis' then 'thesis_revisions' when 'variable' then 'variable_definitions'
 when 'observation' then 'variable_observations' when 'checkin' then 'temperature_checks'
 when 'playbook' then 'strategy_playbooks' when 'assessment' then 'trade_assessments'
 when 'evaluation' then 'rule_evaluations' when 'goal' then 'process_goals'
 when 'progress' then 'process_progress' when 'audit' then 'session_audits'
 when 'layout' then 'dashboard_layouts' end;
$$;
revoke all on function public.pulse_process_table(text) from public,anon,authenticated;
grant execute on function public.pulse_process_table(text) to service_role;
do $$
declare k text; t text;
begin
 foreach k in array array['day','protocol','run','response','thesis','variable','observation','checkin','playbook','assessment','evaluation','goal','progress','audit','layout'] loop
  t := public.pulse_process_table(k);
  execute format('create table public.%I (
   id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
   root_id uuid not null, previous_id uuid, revision integer not null check(revision between 1 and 100000),
   seq bigint generated always as identity unique,
   received_at timestamptz not null default clock_timestamp(),
   data jsonb not null check(jsonb_typeof(data)=''object'' and jsonb_typeof(data->''body'')=''object'' and octet_length(data::text)<=256000),
   day_id uuid generated always as (nullif(data#>>''{body,dayId}'','''')::uuid) stored,
   unique(id,user_id), unique(root_id,revision,user_id),
   foreign key(root_id,user_id) references public.%I(id,user_id) on delete cascade,
   foreign key(previous_id,user_id) references public.%I(id,user_id) on delete cascade,
   check((revision=1 and root_id=id and previous_id is null) or (revision>1 and root_id<>id and previous_id is not null)),
   check((data->>''id'')::uuid=id and (data->>''rootId'')::uuid=root_id and (data->>''revision'')::integer=revision and data->>''kind''=%L)
  )',t,t,t,k);
  execute format('create index on public.%I(user_id,seq)',t);
  execute format('create index on public.%I(day_id,user_id)',t);
  execute format('create index on public.%I(previous_id,user_id)',t);
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy own_process on public.%I for select to authenticated using(user_id=(select auth.uid()))',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('grant select,insert on public.%I to service_role',t);
  execute format('grant usage,select on sequence public.%I to service_role',t||'_seq_seq');
 end loop;
 foreach k in array array['day','protocol','run','response','thesis','variable','observation','checkin','playbook','assessment','evaluation','goal','progress','audit','layout'] loop
  t := public.pulse_process_table(k);
  execute format('alter table public.%I add foreign key(day_id,user_id) references public.trading_days(id,user_id) on delete cascade',t);
 end loop;
end $$;
create unique index trading_days_identity on public.trading_days(user_id,(data#>>'{body,date}'),(data#>>'{body,timezone}')) where revision=1;
create function public.pulse_process_append(p_user uuid,p_records jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare r jsonb; t text; old jsonb; old_user uuid; head jsonb; reference jsonb; reference_table text; exists_ref boolean;
begin
 if jsonb_typeof(p_records)<>'array' or jsonb_array_length(p_records) not between 1 and 40 then raise exception 'invalid process batch'; end if;
 -- Serialize writes for this owner: two devices cannot both append revision N+1.
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,9123));
 for r in select * from jsonb_array_elements(p_records) loop
  t := public.pulse_process_table(r->>'kind');
  if t is null then raise exception 'invalid process kind'; end if;
  old:=null; old_user:=null;
  execute format('select data,user_id from public.%I where id=$1',t) into old,old_user using (r->>'id')::uuid;
  if old is not null then
   if old_user<>p_user or old<>r then raise exception 'idempotency conflict'; end if;
   continue;
  end if;
  if (r->>'revision')::integer>1 then
   head:=null;
   execute format('select data from public.%I where root_id=$1 and user_id=$2 order by revision desc limit 1',t) into head using (r->>'rootId')::uuid,p_user;
   if head is null or head->>'id'<>r->>'previousId' or (head->>'revision')::integer+1<>(r->>'revision')::integer or (head->>'createdAt')::bigint>(r->>'createdAt')::bigint then raise exception 'revision conflict'; end if;
  end if;
  for reference in select * from jsonb_array_elements(r->'refs') loop
   reference_table:=public.pulse_process_table(reference->>'kind');
   if reference_table is null then raise exception 'invalid reference'; end if;
   execute format('select exists(select 1 from public.%I where id=$1 and user_id=$2)',reference_table) into exists_ref using (reference->>'id')::uuid,p_user;
   if not exists_ref then raise exception 'process reference unavailable'; end if;
  end loop;
  execute format('insert into public.%I(id,user_id,root_id,previous_id,revision,data) values($1,$2,$3,$4,$5,$6)',t)
   using (r->>'id')::uuid,p_user,(r->>'rootId')::uuid,(r->>'previousId')::uuid,(r->>'revision')::integer,r;
 end loop;
end $$;
revoke all on function public.pulse_process_append(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pulse_process_append(uuid,jsonb) to service_role;
commit;
