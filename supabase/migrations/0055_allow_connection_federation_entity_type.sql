alter table if exists public.index_federation_outbox
  drop constraint if exists index_federation_outbox_entity_type_check;

alter table if exists public.index_federation_outbox
  add constraint index_federation_outbox_entity_type_check
  check (entity_type in ('index', 'site', 'index_site', 'connection'));

alter table if exists public.index_federation_receipts
  drop constraint if exists index_federation_receipts_entity_type_check;

alter table if exists public.index_federation_receipts
  add constraint index_federation_receipts_entity_type_check
  check (entity_type in ('index', 'site', 'index_site', 'connection'));

notify pgrst, 'reload schema';
