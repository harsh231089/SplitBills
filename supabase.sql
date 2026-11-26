create table if not exists public.bill_groups (
  id text primary key,
  owner_id uuid not null references auth.users(id),
  data jsonb not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  constraint group_data_id_matches check (data->>'id' = id)
);

create table if not exists public.bill_group_members (
  group_id text not null references public.bill_groups(id) on delete cascade,
  email text not null check (email = lower(trim(email)) and email <> ''),
  primary key (group_id, email)
);

alter table public.bill_groups enable row level security;
alter table public.bill_group_members enable row level security;

create or replace function public.is_bill_group_member(group_key text)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1 from public.bill_groups groups
    where groups.id = group_key and (
      groups.owner_id = auth.uid() or exists (
        select 1 from public.bill_group_members members
        join auth.users users on users.id = auth.uid()
        where members.group_id = groups.id
          and users.email_confirmed_at is not null
          and members.email = lower(users.email)
      )
    )
  );
$$;

revoke all on function public.is_bill_group_member(text) from public, anon;
grant execute on function public.is_bill_group_member(text) to authenticated;

drop policy if exists bill_groups_read on public.bill_groups;
create policy bill_groups_read on public.bill_groups for select to authenticated
  using (public.is_bill_group_member(id));
drop policy if exists bill_groups_insert on public.bill_groups;
create policy bill_groups_insert on public.bill_groups for insert to authenticated
  with check (owner_id = auth.uid());
drop policy if exists bill_groups_delete on public.bill_groups;
create policy bill_groups_delete on public.bill_groups for delete to authenticated
  using (owner_id = auth.uid());

drop policy if exists bill_members_read on public.bill_group_members;
create policy bill_members_read on public.bill_group_members for select to authenticated
  using (public.is_bill_group_member(group_id));
drop policy if exists bill_members_insert on public.bill_group_members;
create policy bill_members_insert on public.bill_group_members for insert to authenticated
  with check (exists (select 1 from public.bill_groups groups where groups.id = group_id and groups.owner_id = auth.uid()));
drop policy if exists bill_members_delete on public.bill_group_members;
create policy bill_members_delete on public.bill_group_members for delete to authenticated
  using (exists (select 1 from public.bill_groups groups where groups.id = group_id and groups.owner_id = auth.uid()));

revoke all on public.bill_groups, public.bill_group_members from anon, authenticated;
grant select, insert, delete on public.bill_groups, public.bill_group_members to authenticated;

create or replace function public.save_bill_group(group_key text, group_data jsonb, expected_version integer)
returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare next_version integer;
begin
  if not public.is_bill_group_member(group_key) then
    raise exception 'Access denied';
  end if;
  update public.bill_groups
    set data = group_data, version = version + 1
    where id = group_key and version = expected_version
    returning version into next_version;
  if next_version is null then
    raise exception 'Group changed or no longer exists';
  end if;
  return next_version;
end;
$$;

revoke all on function public.save_bill_group(text, jsonb, integer) from public, anon;
grant execute on function public.save_bill_group(text, jsonb, integer) to authenticated;