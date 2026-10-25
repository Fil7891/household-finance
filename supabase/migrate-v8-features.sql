-- Household Finance V8: reports support, recurring bills, receipt storage, exports support
-- Safe migration for an existing V7 database.

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

drop policy if exists "recurring bills manage" on recurring_bills;
create policy "recurring bills manage" on recurring_bills for all
using(is_household_member(household_id))
with check(is_household_member(household_id));

create or replace function pay_recurring_bill(p_bill_id uuid, p_payment_method text default 'Card')
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  b recurring_bills%rowtype;
  expense_id uuid;
  new_due date;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;

  select * into b from recurring_bills where id=p_bill_id for update;
  if b.id is null then raise exception 'Recurring bill not found'; end if;
  if not is_household_member(b.household_id) then raise exception 'Not authorised'; end if;
  if not b.active then raise exception 'Recurring bill is inactive'; end if;

  insert into expenses(
    household_id,date,amount,description,category_id,paid_by,payment_method,notes,
    created_by,updated_by,recurring_bill_id
  ) values(
    b.household_id,b.next_due_date,b.amount,b.description,b.category_id,
    coalesce(b.paid_by,auth.uid()),p_payment_method,b.notes,
    auth.uid(),auth.uid(),b.id
  ) returning id into expense_id;

  new_due := case b.frequency
    when 'weekly' then b.next_due_date + 7
    when 'fortnightly' then b.next_due_date + 14
    when 'monthly' then (b.next_due_date + interval '1 month')::date
    when 'yearly' then (b.next_due_date + interval '1 year')::date
  end;

  update recurring_bills set next_due_date=new_due,updated_at=now() where id=b.id;
  return expense_id;
end $$;

grant execute on function pay_recurring_bill(uuid,text) to authenticated;

-- Private receipt storage bucket. Files are stored under household-id/expense-id/filename.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'receipts','receipts',false,5242880,
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict(id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "household receipt read" on storage.objects;
drop policy if exists "household receipt insert" on storage.objects;
drop policy if exists "household receipt update" on storage.objects;
drop policy if exists "household receipt delete" on storage.objects;

create policy "household receipt read" on storage.objects for select to authenticated
using(
  bucket_id='receipts'
  and is_household_member(((storage.foldername(name))[1])::uuid)
);

create policy "household receipt insert" on storage.objects for insert to authenticated
with check(
  bucket_id='receipts'
  and is_household_member(((storage.foldername(name))[1])::uuid)
);

create policy "household receipt update" on storage.objects for update to authenticated
using(
  bucket_id='receipts'
  and is_household_member(((storage.foldername(name))[1])::uuid)
)
with check(
  bucket_id='receipts'
  and is_household_member(((storage.foldername(name))[1])::uuid)
);

create policy "household receipt delete" on storage.objects for delete to authenticated
using(
  bucket_id='receipts'
  and is_household_member(((storage.foldername(name))[1])::uuid)
);

-- Add recurring bills to realtime if not already present.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='recurring_bills'
  ) then
    alter publication supabase_realtime add table recurring_bills;
  end if;
end $$;
