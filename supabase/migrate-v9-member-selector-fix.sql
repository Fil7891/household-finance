-- V9: reliable household member selector
-- Safe to run on an existing Household Finance database.

create or replace function public.get_household_members(p_household_id uuid)
returns table(
  user_id uuid,
  role text,
  display_name text,
  email text
)
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  if not is_household_member(p_household_id) then
    raise exception 'You are not a member of this household';
  end if;

  return query
  select
    hm.user_id,
    hm.role,
    p.display_name,
    p.email
  from public.household_members hm
  left join public.profiles p on p.id=hm.user_id
  where hm.household_id=p_household_id
  order by case when hm.role='owner' then 0 else 1 end, coalesce(p.display_name,p.email,'');
end
$$;

grant execute on function public.get_household_members(uuid) to authenticated;
