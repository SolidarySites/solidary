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
          and connection.source_index_id = peer.remote_index_id
          and connection.target_index_id = peer.local_index_id
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

create or replace function public.index_federation_wake_dispatcher()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.index_federation_deactivate_stale_peers();
  perform public.index_federation_recover_orphaned_deliveries();
  perform public.index_federation_dispatch_due_deliveries(50);
  perform public.index_federation_reconcile_deliveries();

  return true;
exception
  when others then
    return false;
end;
$$;

revoke all on function public.index_federation_deactivate_stale_peers() from public;
grant execute on function public.index_federation_deactivate_stale_peers() to service_role;

select public.index_federation_deactivate_stale_peers();

notify pgrst, 'reload schema';
