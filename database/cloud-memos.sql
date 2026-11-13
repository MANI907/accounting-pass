-- Supabase schema for the personal, account-scoped notebook.
create table public.study_memos (
 user_id uuid not null references auth.users(id) on delete cascade,
 id text not null check (id ~ '^[A-Za-z0-9_-]{1,80}$'),
 title text not null default '' check (char_length(title) <= 120),
 text text not null default '' check (char_length(text) <= 20000),
 created_at bigint not null check (created_at >= 0 and created_at <= 8640000000000000),
 updated_at bigint not null check (updated_at >= created_at and updated_at <= 8640000000000000),
 revision integer not null default 1 check (revision > 0),
 deleted boolean not null default false,
 primary key (user_id,id)
);
alter table public.study_memos enable row level security;
revoke all on public.study_memos from anon, authenticated;
grant select, insert, update on public.study_memos to authenticated;
create policy own_memos_select on public.study_memos for select to authenticated
 using ((select auth.uid()) = user_id);
create policy own_memos_insert on public.study_memos for insert to authenticated
 with check ((select auth.uid()) = user_id);
create policy own_memos_update on public.study_memos for update to authenticated
 using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- Optimistic concurrency: clients update only the revision they last read.
-- Tombstones prevent an offline device from resurrecting deleted notes.
create function public.study_memo_revision() returns trigger language plpgsql
 security invoker set search_path = '' as $$
begin
 if TG_OP = 'INSERT' then
  new.revision := 1;
 else
  new.user_id := old.user_id;
  new.id := old.id;
  new.created_at := old.created_at;
  new.revision := old.revision + 1;
 end if;
 if new.deleted then new.title := ''; new.text := ''; end if;
 return new;
end;
$$;
revoke all on function public.study_memo_revision() from public,anon,authenticated;
create trigger study_memo_revision before insert or update on public.study_memos
 for each row execute function public.study_memo_revision();
