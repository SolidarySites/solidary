# Solidary Protocol V1 Node Contracts

This document defines the **minimum network contract** for a user-owned Solidary node.
A node can extend or replace everything else, but if this contract is removed or not honored,
that node is considered out-of-network.

## 1. Non-negotiable public paths

Every node must continue publishing:

- `/.well-known/solidary-links.json`
- `/solidary-media/site-image.jpeg`

These paths are the shared discovery + identity anchor across all node variants.

## 2. Non-negotiable DB contract (`solidary_core` schema)

Migration: `supabase/migrations/0017_protocol_v1_node_core.sql`

### Core tables

- `solidary_core.node_contract`
- `solidary_core.protocol_inbox`
- `solidary_core.protocol_events`
- `solidary_core.discovery_export`
- `solidary_core.discovery_edges_export`

### Write boundary

- `solidary_root_writer` can enqueue protocol commands through `public.rpc_protocol_enqueue_command`.
- Node workers apply commands and mark outcomes through `public.rpc_protocol_mark_command_result`.
- Node owners can read the core tables through RLS-scoped access.
- If the owner removes this schema or revokes this contract, the node remains theirs but is network-isolated.

## 3. RPC contract surface

### `public.rpc_protocol_bootstrap_node_contract`

Purpose: create/update singleton node contract row.

Arguments:

- `p_node_slug text`
- `p_node_title text`
- `p_owner_user_id uuid`
- `p_node_kind text default 'index'`

Returns: `jsonb`

```json
{
  "node_id": "uuid",
  "owner_user_id": "uuid",
  "node_slug": "my-node",
  "node_title": "My Node",
  "node_kind": "index",
  "protocol_version": "1.0.0",
  "protocol_channel": "stable",
  "network_status": "active",
  "allow_root_updates": true,
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

### `public.rpc_protocol_enqueue_command`

Purpose: root network enqueue operation.

Arguments:

- `p_envelope_id text` (globally unique; idempotency key)
- `p_command_type text`
- `p_command_version int`
- `p_issued_at timestamptz`
- `p_not_before_at timestamptz`
- `p_expires_at timestamptz`
- `p_issuer text`
- `p_key_id text`
- `p_signature text`
- `p_payload jsonb`
- `p_payload_hash text`

Returns: `uuid` (`protocol_inbox.id`)

### `public.rpc_protocol_list_pending_commands`

Purpose: list currently pending commands for node worker pull.

Arguments:

- `p_limit int default 20`

Returns: `jsonb` array

```json
[
  {
    "id": "uuid",
    "envelope_id": "cmd_2026_0001",
    "command_type": "protocol.migration.apply",
    "command_version": 1,
    "issued_at": "timestamp",
    "not_before_at": "timestamp",
    "expires_at": "timestamp",
    "issuer": "solidary-root",
    "key_id": "solidary-root-main",
    "signature": "base64",
    "payload": {},
    "payload_hash": "sha256:...",
    "status": "pending"
  }
]
```

### `public.rpc_protocol_mark_command_result`

Purpose: mark command terminal outcome and append event.

Arguments:

- `p_envelope_id text`
- `p_status text` (`applied|failed|rejected|expired|skipped`)
- `p_processor text`
- `p_error_code text default null`
- `p_error_message text default null`
- `p_details jsonb default '{}'`

Returns: `uuid` (`protocol_inbox.id`)

## 4. HTTP endpoint contracts (Netlify functions)

### `POST /.netlify/functions/index-create`

Bootstraps `solidary_core.node_contract` for authenticated owner.

Request body:

```json
{
  "node_slug": "my-node",
  "node_title": "My Node",
  "node_kind": "index"
}
```

Success `200`:

```json
{
  "node": {
    "node_id": "uuid",
    "owner_user_id": "uuid",
    "node_slug": "my-node",
    "node_title": "My Node",
    "node_kind": "index",
    "protocol_version": "1.0.0",
    "protocol_channel": "stable",
    "network_status": "active",
    "allow_root_updates": true,
    "created_at": "timestamp",
    "updated_at": "timestamp"
  },
  "required_public_paths": [
    "/.well-known/solidary-links.json",
    "/solidary-media/site-image.jpeg"
  ],
  "sync_endpoints": {
    "node_sync": "/.netlify/functions/node-sync",
    "protocol_inbox_apply": "/.netlify/functions/protocol-inbox-apply"
  }
}
```

### `POST /.netlify/functions/node-sync`

Lists pending protocol commands for local worker orchestration.

Auth: header `x-solidary-node-secret` must match `SOLIDARY_NODE_SYNC_SECRET`.

Request body:

```json
{
  "limit": 20,
  "include_payload": true
}
```

Success `200`:

```json
{
  "synced_at": "timestamp",
  "pending_count": 1,
  "pending": [
    {
      "envelope_id": "cmd_2026_0001",
      "command_type": "protocol.migration.apply",
      "command_version": 1,
      "issued_at": "timestamp",
      "not_before_at": null,
      "expires_at": null,
      "issuer": "solidary-root",
      "key_id": "solidary-root-main",
      "signature": "base64",
      "payload": {},
      "payload_hash": "sha256:..."
    }
  ]
}
```

### `POST /.netlify/functions/protocol-inbox-apply`

Marks a protocol command as terminally processed after local signature verification + execution.

Auth: header `x-solidary-node-secret` must match `SOLIDARY_NODE_SYNC_SECRET`.

Request body:

```json
{
  "envelope_id": "cmd_2026_0001",
  "status": "applied",
  "processor": "node-worker",
  "details": {
    "applied_migration": "solidary_core@1.0.1"
  }
}
```

Success `200`:

```json
{
  "inbox_id": "uuid",
  "envelope_id": "cmd_2026_0001",
  "status": "applied"
}
```

## 5. Error contract

Shared error body shape:

```json
{
  "error": "message",
  "code": "optional_machine_code"
}
```

Status usage:

- `400`: invalid payload
- `401`: missing/invalid user session
- `403`: invalid node sync secret
- `405`: method not allowed
- `500`: server or upstream DB error
