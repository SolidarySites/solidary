alter table public.sites alter column canonical_url drop not null;

do $$
begin
  create policy "sites_insert_authenticated" on public.sites
    for insert with check (auth.role() = 'authenticated');
exception
  when duplicate_object then null;
end $$;
