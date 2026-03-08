---
name: supabase-postgres-oauth
description: Official-docs-backed guidance for implementing and reviewing Supabase Postgres, Auth, RLS, social login, provider-token handling, and server/client session flows. Use when Codex is changing Supabase SQL migrations, policies, Edge Functions, TypeScript database access, or OAuth callback/session logic, especially for GitHub and other social providers.
---

# Supabase Postgres OAuth

## Overview

Use this skill to make Supabase changes that stay aligned with official documentation and the repo's actual architecture. Classify the task first, load only the relevant reference file, and prefer small changes that preserve the existing client/server auth model instead of mixing patterns.

## Start Here

1. Inspect the codebase before editing.
2. Classify the task as one of:
   - OAuth or session flow work
   - Postgres schema, RLS, or SQL work
   - Mixed work across auth, database, and Edge Functions
3. Load only the reference you need:
   - OAuth, social login, provider tokens, client/server auth boundaries: `references/auth-oauth.md`
   - Migrations, RLS, policies, indexes, generated types: `references/postgres-rls.md`
   - Official source URLs used to build this skill: `references/sources.md`

## Repo Triage

Read the smallest set of files that explains the current pattern:

- Supabase client bootstrap and env handling
- Auth provider, callback route, middleware, or cookie adapter
- `supabase/` directory contents, especially `migrations/`, `functions/`, and `config.toml`
- Existing SQL helper functions, policies, and generated database types
- Call sites that depend on provider tokens or session claims

Decide whether the repo is:

- Browser-first SPA auth using `@supabase/supabase-js`
- Server-side auth using cookies and `@supabase/ssr`
- Hybrid, with browser auth plus server or Edge Function follow-on work

Do not introduce SSR auth helpers into a browser-only app unless the task explicitly requires a server-managed session boundary. Do not move a mature SSR flow back to client-only auth just to simplify a local edit.

## Workflow

### OAuth and Auth

Use `references/auth-oauth.md` when the task touches sign-in, sign-out, callback handling, session refresh, provider tokens, API keys, or redirect URLs.

Apply this sequence:

1. Decide whether the flow is SPA implicit redirect or SSR/PKCE code exchange.
2. Match the repo's existing client model before adding code.
3. Keep provider setup, Supabase redirect allow list, and app callback route consistent.
4. Keep publishable or anon keys in browser-safe code only.
5. Keep `service_role` or secret keys in trusted server runtimes only.
6. If the app needs provider API access, treat provider tokens as sensitive and move them to trusted server storage or server-side exchange paths.
7. On server-side authorization checks, use the verified claims or user lookup path recommended by Supabase docs rather than trusting cookie-backed session state blindly.

### Postgres and RLS

Use `references/postgres-rls.md` when the task touches schema design, migrations, RLS, SQL functions, indexes, or generated types.

Apply this sequence:

1. Prefer checked-in migrations over dashboard-only edits.
2. Update policies together with the tables, functions, or columns they depend on.
3. Review `SELECT`, `INSERT`, `UPDATE`, and `DELETE` together to avoid partial policy regressions.
4. Verify which role should access the table: `anon`, `authenticated`, or a service path.
5. Add or update indexes for policy predicates and common joins.
6. Refresh generated types if the repo keeps them in source control or depends on them in CI.

### Mixed Changes

When the task spans auth plus database:

- Start from the user-facing auth flow and trace inward to server code, Edge Functions, and SQL policies.
- Preserve existing trust boundaries.
- Avoid solving missing auth context in SQL with weaker RLS or broader keys.
- Avoid solving server-side authorization problems by moving privileged work into the browser.

## Change Rules

- Prefer adapting existing Supabase client factories, auth services, and query helpers over creating parallel ones.
- Keep components focused on UI and local state; move multi-step Supabase mutations into services.
- Do not weaken RLS to make a client query pass. Fix the policy, session propagation, or trusted server path.
- Do not place privileged keys, provider secrets, or service-role calls in browser code.
- When editing OAuth flows, scrub stale callback params only if the app already relies on client-side callback cleanup.
- When editing SQL, favor explicitness over cleverness. Policies and helper functions should be readable enough to audit.

## Deliverables

When you finish:

1. Summarize the auth or database model you found.
2. State which Supabase pattern you preserved or changed.
3. Call out any required dashboard configuration, redirect allow list changes, or provider console updates.
4. Mention unverified assumptions, especially around provider scopes, callback URLs, and RLS behavior.

## References

- `references/auth-oauth.md`
- `references/postgres-rls.md`
- `references/sources.md`
