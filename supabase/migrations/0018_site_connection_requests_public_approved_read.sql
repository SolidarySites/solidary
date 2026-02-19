drop policy if exists "site_connection_requests_select_public_approved" on public.site_connection_requests;

create policy "site_connection_requests_select_public_approved" on public.site_connection_requests
  for select using (
    status = 'approved'
  );
