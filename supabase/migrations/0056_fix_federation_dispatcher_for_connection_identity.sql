create or replace function public.index_federation_deactivate_stale_peers()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated_count int := 0;
begin
  with stale_peers as (
    update public.index_federation_peers peer
    set
      is_active = false,
      updated_at = now()
    where peer.is_active = true
      and peer.relationship = 'child'
      and peer.created_at <= now() - interval '10 minutes'
      and not exists (
        select 1
        from public.connections connection
        where connection.status = 'approved'
          and connection.requester_type = 'index'
          and connection.requested_type = 'index'
          and connection.requester_index_id = peer.remote_index_id
          and connection.requested_index_id = peer.local_index_id
      )
    returning peer.remote_index_id
  )
  update public.index_federation_deliveries delivery
  set
    status = 'failed',
    request_id = null,
    dispatched_at = null,
    claimed_at = null,
    last_error =
      'Federation peer was deactivated because its approved child-index connection no longer exists.',
    updated_at = now()
  where delivery.remote_index_id in (
      select stale_peers.remote_index_id
      from stale_peers
    )
    and delivery.status in ('pending', 'retry', 'dispatching');

  get diagnostics v_updated_count = row_count;
  return v_updated_count;
end;
$$;

notify pgrst, 'reload schema';
