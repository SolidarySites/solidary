create or replace function public.index_federation_sign_package(
  p_package jsonb,
  p_shared_secret text
) returns text
language sql
immutable
as $$
  select encode(
    extensions.hmac(
      convert_to(
        jsonb_build_object(
          'package_id', p_package ->> 'package_id',
          'origin_index_id', p_package ->> 'origin_index_id',
          'sender_index_id', p_package ->> 'sender_index_id',
          'entity_type', p_package ->> 'entity_type',
          'operation', p_package ->> 'operation',
          'entity_id', p_package ->> 'entity_id',
          'index_id', p_package ->> 'index_id',
          'site_id', p_package ->> 'site_id',
          'payload', coalesce(p_package -> 'payload', '{}'::jsonb)
        )::text,
        'utf8'
      ),
      convert_to(coalesce(p_shared_secret, ''), 'utf8'),
      'sha256'
    ),
    'hex'
  );
$$;

create or replace function public.index_federation_recover_orphaned_deliveries()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated_count int := 0;
begin
  update public.index_federation_deliveries delivery
  set
    status = 'pending',
    attempts = greatest(0, delivery.attempts - 1),
    next_attempt_at = now(),
    request_id = null,
    dispatched_at = null,
    claimed_at = null,
    last_error = coalesce(
      nullif(trim(coalesce(delivery.last_error, '')), ''),
      'Recovered an orphaned federation delivery before dispatch.'
    ),
    updated_at = now()
  where delivery.status = 'dispatching'
    and delivery.request_id is null
    and delivery.dispatched_at is null;

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
  perform public.index_federation_recover_orphaned_deliveries();
  perform public.index_federation_dispatch_due_deliveries(50);
  perform public.index_federation_reconcile_deliveries();

  return true;
exception
  when others then
    return false;
end;
$$;

create or replace function public.index_federation_dispatch_due_deliveries(
  p_limit int default 20
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim record;
  v_package jsonb;
  v_signature text;
  v_request_id bigint;
  v_sent_count int := 0;
  v_next_status text;
begin
  for v_claim in
    select *
    from public.index_federation_claim_deliveries(p_limit)
  loop
    begin
      v_package := public.index_federation_build_package_json(
        v_claim.package_id,
        v_claim.origin_index_id,
        v_claim.local_index_id,
        v_claim.entity_type,
        v_claim.operation,
        v_claim.entity_id,
        v_claim.index_id,
        v_claim.site_id,
        v_claim.payload
      );
      v_signature := public.index_federation_sign_package(
        v_package,
        v_claim.shared_secret
      );

      v_request_id := net.http_post(
        url := regexp_replace(v_claim.remote_project_url, '/+$', '') ||
          '/rest/v1/rpc/index_federation_receive_package',
        headers := jsonb_build_object(
          'content-type', 'application/json',
          'apikey', v_claim.remote_publishable_key,
          'authorization', 'Bearer ' || v_claim.remote_publishable_key
        ),
        body := jsonb_build_object(
          'p_package', v_package,
          'p_signature', v_signature
        )
      );

      update public.index_federation_deliveries delivery
      set
        request_id = v_request_id,
        dispatched_at = now(),
        claimed_at = now(),
        last_response_code = null,
        last_error = null,
        updated_at = now()
      where delivery.package_id = v_claim.package_id
        and delivery.remote_index_id = v_claim.remote_index_id;

      v_sent_count := v_sent_count + 1;
    exception
      when others then
        v_next_status := case
          when coalesce(v_claim.attempts, 0) >= 8 then 'failed'
          else 'retry'
        end;

        update public.index_federation_deliveries delivery
        set
          status = v_next_status,
          request_id = null,
          dispatched_at = null,
          claimed_at = null,
          next_attempt_at = case
            when v_next_status = 'retry' then
              now() + make_interval(
                secs => least(
                  300,
                  power(2, greatest(0, coalesce(v_claim.attempts, 1) - 1))::int
                )
              )
            else delivery.next_attempt_at
          end,
          last_error = sqlerrm,
          updated_at = now()
        where delivery.package_id = v_claim.package_id
          and delivery.remote_index_id = v_claim.remote_index_id;
    end;
  end loop;

  return v_sent_count;
end;
$$;

revoke all on function public.index_federation_recover_orphaned_deliveries() from public;
grant execute on function public.index_federation_recover_orphaned_deliveries() to service_role;

select public.index_federation_recover_orphaned_deliveries();

notify pgrst, 'reload schema';
