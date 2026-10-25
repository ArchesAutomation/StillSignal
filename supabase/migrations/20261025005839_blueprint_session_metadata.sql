-- Preserve the latest explicitly saved context/consent/P&L snapshot during stale note sync.
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
 update pulse_sessions set data=(p_data - 'blueprint') || case
    when coalesce((p_data->'blueprint'->>'updatedAt')::bigint,0) >= coalesce((existing.data->'blueprint'->>'updatedAt')::bigint,0) and p_data ? 'blueprint'
      then jsonb_build_object('blueprint',p_data->'blueprint')
    when existing.data ? 'blueprint' then jsonb_build_object('blueprint',existing.data->'blueprint')
    else '{}'::jsonb end ||jsonb_build_object('events',merged_events,'journal',merged_notes,'sampleCount',greatest((existing.data->>'sampleCount')::integer,(p_data->>'sampleCount')::integer))
  ||case when existing.data ? 'endedAt' then jsonb_build_object('endedAt',existing.data->'endedAt') else '{}'::jsonb end,
  updated_at=now() where id=p_id and user_id=p_user;
end;$$;
revoke all on function public.pulse_save_session(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pulse_save_session(uuid,uuid,jsonb) to service_role;
