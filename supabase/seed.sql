-- Seed a starter archive for the first auth user in the project.
-- If you want a specific owner, replace the subquery with a UUID.
insert into public.archives (owner_user_id, slug, title)
select id, 'my-archive', 'My First Archive'
from auth.users
limit 1;
