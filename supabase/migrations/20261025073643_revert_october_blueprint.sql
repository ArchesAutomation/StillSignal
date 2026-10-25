-- Restore the pre-blueprint save and live-journal functions. Saved records remain intact.
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
create or replace function public.pulse_extension_action(p_token_hash text,p_instance uuid,p_action jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare credential pulse_extension_credentials; s pulse_sessions; old jsonb; n jsonb; notes jsonb;
 previous pulse_journal_requests; sid uuid; req uuid; kind text; rev bigint; t bigint;
 point jsonb; opening bigint; baseline numeric; context_value jsonb; trade jsonb; baseline_seconds bigint; window_ms bigint;
begin
 select * into credential from pulse_extension_credentials where token_hash=p_token_hash and instance_id=p_instance for update;
 if not found or credential.revoked_at is not null or credential.expires_at<=now() then raise exception 'unauthorized';end if;
 if p_action->>'action'='disconnect' then
  update pulse_extension_credentials set revoked_at=now() where id=credential.id;return '{"ok":true}'::jsonb;
 elsif p_action->>'action'='rotate' then
  update pulse_extension_credentials set token_hash=p_action->>'tokenHash',expires_at=now()+interval '30 days' where id=credential.id;
  return jsonb_build_object('expiresAt',extract(epoch from now()+interval '30 days')*1000);
 elsif p_action->>'action'='context' then
  return jsonb_build_object('userId',credential.user_id,'identity',credential.identity,'sessions',(
   select coalesce(jsonb_agg(data || jsonb_build_object(
     'journal',(select coalesce(jsonb_agg(j),'[]'::jsonb) from (select j-'screenshot' j from jsonb_array_elements(data->'journal') j where not j ? 'deletedAt' order by (j->>'t')::bigint desc limit 5) recent),
     'events',(select coalesce(jsonb_agg(e),'[]'::jsonb) from (select e from jsonb_array_elements(data->'events') e order by (e->>'t')::bigint desc limit 20) recent)
   ) order by started_at desc),'[]'::jsonb) from
   (select data,started_at from pulse_sessions where user_id=credential.user_id order by started_at desc limit 100) owned));
 end if;
 sid:=(p_action->>'sessionId')::uuid;req:=(p_action->>'requestId')::uuid;
 -- Serialize retries including session creation. Deleted sessions stay rejected even for an old successful request.
 perform pg_advisory_xact_lock(hashtextextended(credential.user_id::text||req::text,0));
 if exists(select 1 from pulse_deleted_sessions where id=sid) then raise exception 'session deleted';end if;
 select * into previous from pulse_journal_requests where user_id=credential.user_id and request_id=req;
 if found then
  if previous.payload_hash<>encode(sha256(convert_to(p_action::text,'UTF8')),'hex') or previous.session_id<>sid then raise exception 'idempotency conflict';end if;
  select data into n from pulse_sessions where id=sid and user_id=credential.user_id;
  if previous.result ? 'noteId' then
   select j into n from jsonb_array_elements(n->'journal') j where j->>'id'=previous.result->>'noteId';
   return jsonb_build_object('note',n);
  end if;
  return jsonb_build_object('session',n);
 end if;
 if p_action->>'action'='start' then
  t:=(p_action->>'startedAt')::bigint;
  if t>extract(epoch from now())*1000+300000 then raise exception 'invalid timestamp';end if;
  n:=jsonb_build_object('id',sid,'owner',credential.user_id,'name',p_action->>'name','startedAt',t,'source','journal','events','[]'::jsonb,'journal','[]'::jsonb,'sampleCount',0);
  if exists(select 1 from pulse_sessions where id=sid) then raise exception 'idempotency conflict';end if;
  insert into pulse_sessions(id,user_id,started_at,data) values(sid,credential.user_id,t,n);
  n:=jsonb_build_object('session',n);
 else
  select * into s from pulse_sessions where id=sid and user_id=credential.user_id for update;
  if not found then raise exception 'session not found';end if;
  kind:=p_action->'mutation'->>'kind';
  if kind='create' then
   n:=p_action->'mutation'->'note';t:=(n->>'t')::bigint;
   if n ? 'deletedAt' or n ? 'screenshot' or (n ? 'context' and ((n->'context')-'hrEventId')<>'{}'::jsonb) then raise exception 'invalid note context';end if;
   if p_action->'mutation' ? 'selection' then n:=n||jsonb_build_object('captureScope',p_action->'mutation'->'selection');end if;
   if t<s.started_at or (s.data ? 'endedAt' and t>(s.data->>'endedAt')::bigint)
   or t>extract(epoch from now())*1000+300000 then raise exception 'invalid timestamp';end if;
   if exists(select 1 from jsonb_array_elements(s.data->'journal') j where j->>'id'=n->>'id') then raise exception 'idempotency conflict';end if;
   if jsonb_array_length(s.data->'journal')>=1000 then raise exception 'journal full';end if;
  else
   select j into old from jsonb_array_elements(s.data->'journal') j where j->>'id'=p_action->'mutation'->>'noteId';
   if old is null or old ? 'deletedAt' then raise exception 'note not found';end if;
   rev:=coalesce((old->>'updatedAt')::bigint,(old->>'t')::bigint);
   if kind<>'enrich' and rev<>(p_action->'mutation'->>'expectedRevision')::bigint then raise exception 'revision conflict';end if;
   n:=old;t:=(n->>'t')::bigint;
   if kind='correct' then n:=n||jsonb_build_object('text',p_action->'mutation'->>'text');
   elsif kind='tag' then n:=n||jsonb_build_object('label',p_action->'mutation'->>'label');
   elsif kind='delete' then n:=(n-'context'-'screenshot')||jsonb_build_object('text','','label','Other','deletedAt',greatest((extract(epoch from clock_timestamp())*1000)::bigint,rev+1));
   elsif kind<>'enrich' then raise exception 'invalid action';end if;
  end if;
  -- Attach only measured samples near this moment. Late samples enrich the same ID.
  if kind in ('create','enrich') then
   baseline_seconds:=coalesce((n->'captureScope'->>'baselineSeconds')::bigint,300);window_ms:=coalesce((n->'captureScope'->>'windowSeconds')::bigint,60)*1000;
   select p into point from pulse_sample_chunks c cross join lateral jsonb_array_elements(c.samples) p
   where c.user_id=credential.user_id and c.session_id=sid and abs((p->>'t')::bigint-t)<=10000
   order by abs((p->>'t')::bigint-t) limit 1;
   select min((p->>'t')::bigint) into opening from pulse_sample_chunks c cross join lateral jsonb_array_elements(c.samples) p where c.user_id=credential.user_id and c.session_id=sid;
   select case when count(*)>=30 and max((p->>'t')::bigint)-opening>=baseline_seconds*800 and t>=opening+baseline_seconds*1000 then avg((p->>'bpm')::numeric) end into baseline
   from pulse_sample_chunks c cross join lateral jsonb_array_elements(c.samples) p where c.user_id=credential.user_id and c.session_id=sid and (p->>'t')::bigint<opening+baseline_seconds*1000;
   select e into trade from jsonb_array_elements(s.data->'events') e where e->>'provenance' is distinct from 'alert' and coalesce((e->>'voided')::boolean,false)=false
   and e->>'timePrecision' is distinct from 'day' and abs((e->>'t')::bigint-t)<=window_ms
   and (n->'captureScope'->>'instrumentId' is null or coalesce(e->'instrument'->>'id',e->>'symbol')=n->'captureScope'->>'instrumentId')
   and (n->'captureScope'->>'accountId' is null or coalesce(e->'broker'->>'accountId',e->>'account')=n->'captureScope'->>'accountId')
   order by abs((e->>'t')::bigint-t) limit 1;
   context_value:=coalesce(n->'context','{}'::jsonb)||jsonb_strip_nulls(jsonb_build_object('bpm',(point->>'bpm')::numeric,'baseline',case when point is not null then baseline end,'delta',case when point is not null then (point->>'bpm')::numeric-baseline end,'eventId',trade->>'id'));
   if context_value<>'{}'::jsonb then n:=n||jsonb_build_object('context',context_value);end if;
   -- The validated live-app bridge supplies the moment ID. Samples can arrive
   -- later; their absence never creates BPM, baseline, delta, or an emotion.
   if kind='create' and n->>'source'='hr-checkin' and n->'context'->>'hrEventId' is distinct from 'hr-'||t::text then raise exception 'invalid hr moment';end if;
  end if;
  if kind='enrich' and n=old then n:=jsonb_build_object('note',old);
  else
   n:=n||jsonb_build_object('updatedAt',greatest((extract(epoch from clock_timestamp())*1000)::bigint,coalesce(rev,0)+1));
   select coalesce(jsonb_agg(j order by (j->>'t')::bigint,j->>'id'),'[]'::jsonb) into notes from
   (select j from jsonb_array_elements(s.data->'journal') j where j->>'id'<>n->>'id' union all select n) items;
   update pulse_sessions set data=jsonb_set(data,'{journal}',notes),updated_at=now() where id=sid and user_id=credential.user_id;
   n:=jsonb_build_object('note',n);
  end if;
 end if;
 -- Retry history retains hashes and IDs, never deleted or superseded reflection text.
 insert into pulse_journal_requests(user_id,request_id,session_id,payload_hash,result) values(credential.user_id,req,sid,encode(sha256(convert_to(p_action::text,'UTF8')),'hex'),
 case when n ? 'note' then jsonb_build_object('noteId',n->'note'->>'id') else jsonb_build_object('sessionId',sid) end);
 return n;
end;$$;
revoke all on function public.pulse_save_session(uuid,uuid,jsonb),public.pulse_extension_action(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pulse_save_session(uuid,uuid,jsonb),public.pulse_extension_action(text,uuid,jsonb) to service_role;
