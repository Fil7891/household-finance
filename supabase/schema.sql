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
  invite_code text not null unique default upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),
  invite_expires_at timestamptz not null default (now()+interval '24 hours'),
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

create or replace function is_household_owner(hid uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from household_members where household_id=hid and user_id=auth.uid() and role='owner')
$$;

create or replace function create_household(p_name text)
returns uuid language plpgsql security definer set search_path=public as $$
declare hid uuid;
begin
 if auth.uid() is null then raise exception 'Not signed in'; end if;
 if exists(select 1 from household_members where user_id=auth.uid()) then raise exception 'User already belongs to a household'; end if;
 insert into households(name,created_by,invite_code,invite_expires_at)
 values(trim(p_name),auth.uid(),upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),now()+interval '24 hours') returning id into hid;
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
 select id into hid from households
 where upper(invite_code)=upper(trim(p_invite_code)) and invite_expires_at>now()
 for update;
 if hid is null then raise exception 'Invite code is invalid or expired'; end if;
 insert into household_members(household_id,user_id,role) values(hid,auth.uid(),'member');
 update households set invite_code=upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)), invite_expires_at=now()+interval '24 hours' where id=hid;
 return hid;
end $$;

create or replace function rotate_household_invite(p_household_id uuid)
returns text language plpgsql security definer set search_path=public as $$
declare new_code text;
begin
 if auth.uid() is null then raise exception 'Not signed in'; end if;
 if not is_household_owner(p_household_id) then raise exception 'Only the household owner can create an invite'; end if;
 new_code:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
 update households set invite_code=new_code,invite_expires_at=now()+interval '24 hours' where id=p_household_id;
 return new_code;
end $$;

create or replace function get_household_invite(p_household_id uuid)
returns table(invite_code text, invite_expires_at timestamptz)
language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'Not signed in'; end if;
 if not is_household_owner(p_household_id) then raise exception 'Only the household owner can view invite details'; end if;
 return query select h.invite_code,h.invite_expires_at from households h where h.id=p_household_id;
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
create policy "household update" on households for update using(is_household_owner(id)) with check(is_household_owner(id));
create policy "membership read" on household_members for select using(is_household_member(household_id));
create policy "categories manage" on categories for all using(is_household_member(household_id)) with check(is_household_member(household_id));
create policy "expenses manage" on expenses for all using(is_household_member(household_id)) with check(is_household_member(household_id));
create policy "income manage" on income for all using(is_household_member(household_id)) with check(is_household_member(household_id));
create policy "shopping manage" on shopping_items for all using(is_household_member(household_id)) with check(is_household_member(household_id));

-- Do not expose invite columns through the browser-facing table API.
revoke select on households from authenticated;
grant select(id,name,monthly_budget,created_by,created_at) on households to authenticated;

grant execute on function create_household(text) to authenticated;
grant execute on function join_household(text) to authenticated;
grant execute on function rotate_household_invite(uuid) to authenticated;
grant execute on function get_household_invite(uuid) to authenticated;
grant execute on function is_household_member(uuid) to authenticated;
grant execute on function is_household_owner(uuid) to authenticated;

alter publication supabase_realtime add table expenses;
alter publication supabase_realtime add table income;
alter publication supabase_realtime add table shopping_items;

-- V8 additions: recurring bills and private receipt storage
alter table expenses add column if not exists receipt_path text;

create table if not exists recurring_bills(
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  description text not null,
  amount numeric(12,2) not null check(amount>=0),
  category_id uuid references categories(id) on delete set null,
  paid_by uuid references profiles(id),
  frequency text not null check(frequency in('weekly','fortnightly','monthly','yearly')),
  next_due_date date not null,
  active boolean not null default true,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table expenses add column if not exists recurring_bill_id uuid references recurring_bills(id) on delete set null;
alter table recurring_bills enable row level security;
create policy "recurring bills manage" on recurring_bills for all using(is_household_member(household_id)) with check(is_household_member(household_id));

create or replace function pay_recurring_bill(p_bill_id uuid, p_payment_method text default 'Card')
returns uuid language plpgsql security definer set search_path=public as $$
declare b recurring_bills%rowtype; expense_id uuid; new_due date;
begin
 if auth.uid() is null then raise exception 'Not signed in'; end if;
 select * into b from recurring_bills where id=p_bill_id for update;
 if b.id is null then raise exception 'Recurring bill not found'; end if;
 if not is_household_member(b.household_id) then raise exception 'Not authorised'; end if;
 if not b.active then raise exception 'Recurring bill is inactive'; end if;
 insert into expenses(household_id,date,amount,description,category_id,paid_by,payment_method,notes,created_by,updated_by,recurring_bill_id)
 values(b.household_id,b.next_due_date,b.amount,b.description,b.category_id,coalesce(b.paid_by,auth.uid()),p_payment_method,b.notes,auth.uid(),auth.uid(),b.id)
 returning id into expense_id;
 new_due:=case b.frequency when 'weekly' then b.next_due_date+7 when 'fortnightly' then b.next_due_date+14 when 'monthly' then (b.next_due_date+interval '1 month')::date when 'yearly' then (b.next_due_date+interval '1 year')::date end;
 update recurring_bills set next_due_date=new_due,updated_at=now() where id=b.id;
 return expense_id;
end $$;
grant execute on function pay_recurring_bill(uuid,text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('receipts','receipts',false,5242880,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy "household receipt read" on storage.objects for select to authenticated using(bucket_id='receipts' and is_household_member(((storage.foldername(name))[1])::uuid));
create policy "household receipt insert" on storage.objects for insert to authenticated with check(bucket_id='receipts' and is_household_member(((storage.foldername(name))[1])::uuid));
create policy "household receipt update" on storage.objects for update to authenticated using(bucket_id='receipts' and is_household_member(((storage.foldername(name))[1])::uuid)) with check(bucket_id='receipts' and is_household_member(((storage.foldername(name))[1])::uuid));
create policy "household receipt delete" on storage.objects for delete to authenticated using(bucket_id='receipts' and is_household_member(((storage.foldername(name))[1])::uuid));

alter publication supabase_realtime add table recurring_bills;
