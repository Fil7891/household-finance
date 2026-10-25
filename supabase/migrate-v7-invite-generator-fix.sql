-- V7: fix invite-code generation on Supabase
-- Safe for an existing V6 database. Does not delete household or finance data.
-- Replaces pgcrypto gen_random_bytes() calls with PostgreSQL gen_random_uuid().

alter table households
  alter column invite_code set default upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));

create or replace function create_household(p_name text)
returns uuid language plpgsql security definer set search_path=public as $$
declare hid uuid;
begin
 if auth.uid() is null then raise exception 'Not signed in'; end if;
 if exists(select 1 from household_members where user_id=auth.uid()) then raise exception 'User already belongs to a household'; end if;
 insert into households(name,created_by,invite_code,invite_expires_at)
 values(trim(p_name),auth.uid(),upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),now()+interval '48 hours') returning id into hid;
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
 limit 1;
 if hid is null then raise exception 'Invite code is invalid or expired'; end if;
 insert into household_members(household_id,user_id,role) values(hid,auth.uid(),'member');
 update households
 set invite_code=upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),
     invite_expires_at=now()+interval '48 hours'
 where id=hid;
 return hid;
end $$;

create or replace function rotate_household_invite(p_household_id uuid)
returns text language plpgsql security definer set search_path=public as $$
declare new_code text;
begin
 if auth.uid() is null then raise exception 'Not signed in'; end if;
 if not is_household_owner(p_household_id) then raise exception 'Only the household owner can create an invite'; end if;
 new_code:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
 update households
 set invite_code=new_code,
     invite_expires_at=now()+interval '48 hours'
 where id=p_household_id;
 return new_code;
end $$;

grant execute on function create_household(text) to authenticated;
grant execute on function join_household(text) to authenticated;
grant execute on function rotate_household_invite(uuid) to authenticated;
