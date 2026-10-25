create extension if not exists pgcrypto;

create table if not exists profiles(
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz default now()
);

create table if not exists households(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique default upper(substr(encode(gen_random_bytes(8),'hex'),1,8)),
  monthly_budget numeric(12,2) not null default 0,
  created_by uuid not null references auth.users(id),
  created_at timestamptz default now()
);

create table if not exists household_members(
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check(role in('owner','member')),
  created_at timestamptz default now(),
  primary key(household_id,user_id)
);

create table if not exists categories(
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  unique(household_id,name)
);

create table if not exists expenses(
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  date date not null,
  amount numeric(12,2) not null check(amount>=0),
  description text not null,
  category_id uuid references categories(id) on delete set null,
  paid_by uuid references profiles(id),
  payment_method text,
  notes text,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create table if not exists income(
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  date date not null,
  amount numeric(12,2) not null check(amount>=0),
  source text not null,
  received_by uuid references profiles(id),
  notes text,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create table if not exists shopping_items(
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  item text not null,
  quantity text,
  category_id uuid references categories(id) on delete set null,
  completed boolean not null default false,
  added_by uuid references profiles(id),
  completed_by uuid references profiles(id),
  completed_at timestamptz,
  created_at timestamptz default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.profiles(id,email,display_name)
 values(new.id,new.email,coalesce(new.raw_user_meta_data->>'display_name',split_part(new.email,'@',1)))
 on conflict(id) do nothing;
 return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function is_household_member(hid uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from household_members where household_id=hid and user_id=auth.uid())
$$;

create or replace function create_household(p_name text)
returns uuid language plpgsql security definer set search_path=public as $$
declare hid uuid;
begin
 if auth.uid() is null then raise exception 'Not signed in'; end if;
 if exists(select 1 from household_members where user_id=auth.uid()) then raise exception 'User already belongs to a household'; end if;
 insert into households(name,created_by) values(trim(p_name),auth.uid()) returning id into hid;
 insert into household_members(household_id,user_id,role) values(hid,auth.uid(),'owner');
 insert into categories(household_id,name,created_by) values
 (hid,'Housing',auth.uid()),(hid,'Groceries',auth.uid()),(hid,'Transport',auth.uid()),
 (hid,'Bills',auth.uid()),(hid,'Dining',auth.uid()),(hid,'Health',auth.uid()),
 (hid,'Children',auth.uid()),(hid,'Entertainment',auth.uid()),(hid,'Other',auth.uid());
 return hid;
end $$;

create or replace function join_household(p_invite_code text)
returns uuid language plpgsql security definer set search_path=public as $$
declare hid uuid;
begin
 if auth.uid() is null then raise exception 'Not signed in'; end if;
 if exists(select 1 from household_members where user_id=auth.uid()) then raise exception 'User already belongs to a household'; end if;
 select id into hid from households where upper(invite_code)=upper(trim(p_invite_code));
 if hid is null then raise exception 'Invite code not found'; end if;
 insert into household_members(household_id,user_id,role) values(hid,auth.uid(),'member');
 return hid;
end $$;

alter table profiles enable row level security;
alter table households enable row level security;
alter table household_members enable row level security;
alter table categories enable row level security;
alter table expenses enable row level security;
alter table income enable row level security;
alter table shopping_items enable row level security;

create policy "profile read" on profiles for select using(id=auth.uid() or exists(
 select 1 from household_members a join household_members b on a.household_id=b.household_id
 where a.user_id=auth.uid() and b.user_id=profiles.id
));
create policy "profile update" on profiles for update using(id=auth.uid());

create policy "household read" on households for select using(is_household_member(id));
create policy "household update" on households for update using(is_household_member(id));
create policy "membership read" on household_members for select using(is_household_member(household_id));

create policy "categories manage" on categories for all using(is_household_member(household_id)) with check(is_household_member(household_id));
create policy "expenses manage" on expenses for all using(is_household_member(household_id)) with check(is_household_member(household_id));
create policy "income manage" on income for all using(is_household_member(household_id)) with check(is_household_member(household_id));
create policy "shopping manage" on shopping_items for all using(is_household_member(household_id)) with check(is_household_member(household_id));

grant execute on function create_household(text) to authenticated;
grant execute on function join_household(text) to authenticated;
grant execute on function is_household_member(uuid) to authenticated;

alter publication supabase_realtime add table expenses;
alter publication supabase_realtime add table income;
alter publication supabase_realtime add table shopping_items;
