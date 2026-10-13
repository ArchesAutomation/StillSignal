begin;
-- Preserve newer edits and deletion tombstones when an offline client syncs old notes.
create or replace function public.pulse_save_session(p_user uuid,p_id uuid,p_data jsonb) returns void
language plpgsql security invoker set search_path=public as $$
declare merged_notes jsonb; existing pulse_sessions;
begin
 if exists(select 1 from pulse_deleted_sessions where id=p_id) then raise exception 'session deleted';end if;
 if p_data->>'owner' is distinct from p_user::text or p_data->>'id' is distinct from p_id::text then raise exception 'invalid owner';end if;
 insert into pulse_sessions(id,user_id,started_at,data) values(p_id,p_user,(p_data->>'startedAt')::bigint,p_data) on conflict(id) do nothing;
 select * into existing from pulse_sessions where id=p_id and user_id=p_user for update;
 if not found or existing.started_at<>(p_data->>'startedAt')::bigint then raise exception 'session ownership mismatch';end if;
 select coalesce(jsonb_agg(v order by (v->>'t')::bigint,v->>'id'),'[]'::jsonb) into merged_notes from (
  select distinct on(v->>'id') v from jsonb_array_elements((existing.data->'journal')||(p_data->'journal')) v
  order by v->>'id',greatest(coalesce((v->>'updatedAt')::bigint,(v->>'t')::bigint),coalesce((v->>'deletedAt')::bigint,0)) desc,(v ? 'deletedAt') desc
 ) items;
 if jsonb_array_length(merged_notes)>1000 then raise exception 'journal full';end if;
 update pulse_sessions set data=p_data || jsonb_build_object(
  'events',(select coalesce(jsonb_agg(v order by (v->>'t')::bigint,v->>'id'),'[]'::jsonb) from (select distinct on(v->>'id') v from jsonb_array_elements((existing.data->'events')||(p_data->'events')) v) items),
  'journal',merged_notes,
  'sampleCount',greatest((existing.data->>'sampleCount')::integer,(p_data->>'sampleCount')::integer)
 ) || case when existing.data ? 'endedAt' then jsonb_build_object('endedAt',existing.data->'endedAt') else '{}'::jsonb end,
 updated_at=now() where id=p_id and user_id=p_user;
end;$$;
revoke all on function public.pulse_save_session(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pulse_save_session(uuid,uuid,jsonb) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('pulse-screenshots','pulse-screenshots',false,5242880,array['image/png','image/jpeg','image/webp'])
on conflict(id) do nothing;
create policy pulse_screenshot_read on storage.objects for select to authenticated
using(bucket_id='pulse-screenshots' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy pulse_screenshot_upload on storage.objects for insert to authenticated
with check(bucket_id='pulse-screenshots' and (storage.foldername(name))[1]=(select auth.uid())::text
 and exists(select 1 from public.pulse_sessions s where s.user_id=(select auth.uid()) and s.id::text=(storage.foldername(name))[2]));
create policy pulse_screenshot_delete on storage.objects for delete to authenticated
using(bucket_id='pulse-screenshots' and (storage.foldername(name))[1]=(select auth.uid())::text);
commit;
