-- Append-only, account-owned study operations. No UPDATE/DELETE client grants.
create table public.study_events (
 user_id uuid not null references auth.users(id) on delete cascade,
 id text not null check (id ~ '^[A-Za-z0-9_-]{1,80}$'),
 question_id text not null check (question_id ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[1-7][0-9]|80)$'),
 kind text not null check (kind in ('attempt','bookmark','note','topic','position','baseline')),
 payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 100000),
 happened_at bigint not null check (happened_at >= 0 and happened_at <= 8640000000000000),
 primary key (user_id,id),
 constraint study_event_payload check (coalesce(case kind
  when 'attempt' then
   jsonb_typeof(payload->'answer') = 'number' and payload->>'answer' in ('1','2','3','4')
   and payload->>'confidence' in ('sure','unsure','guess')
   and payload - array['answer','confidence'] = '{}'::jsonb
  when 'bookmark' then jsonb_typeof(payload->'value') = 'boolean' and payload - 'value' = '{}'::jsonb
  when 'note' then jsonb_typeof(payload->'value') = 'string' and char_length(payload->>'value') <= 20000 and payload - 'value' = '{}'::jsonb
  when 'topic' then jsonb_typeof(payload->'value') = 'string' and char_length(payload->>'value') <= 20000 and payload - 'value' = '{}'::jsonb
  when 'position' then payload = '{}'::jsonb
  when 'baseline' then
   jsonb_typeof(payload->'answer') = 'number' and payload->>'answer' in ('1','2','3','4')
   and payload->>'confidence' in ('sure','unsure','guess')
   and jsonb_typeof(payload->'correct') = 'boolean'
   and jsonb_typeof(payload->'attempts') = 'number'
   and jsonb_typeof(payload->'lastAt') = 'number'
   and jsonb_typeof(payload->'dueAt') = 'number'
   and jsonb_typeof(payload->'streak') = 'number'
   and payload - array['answer','confidence','correct','attempts','lastAt','dueAt','streak'] = '{}'::jsonb
  else false end,false))
);
alter table public.study_events enable row level security;
revoke all on public.study_events from anon,authenticated;
grant select,insert on public.study_events to authenticated;
create policy own_study_events_select on public.study_events for select to authenticated
 using ((select auth.uid()) = user_id);
create policy own_study_events_insert on public.study_events for insert to authenticated
 with check ((select auth.uid()) = user_id);
