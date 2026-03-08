# Postgres and RLS

Use this reference when changing schema, SQL functions, policies, indexes, or generated database types.

## Migration Workflow

- Prefer checked-in SQL migrations under `supabase/migrations/`.
- For new changes, create a migration and edit the SQL directly.
- Use local reset workflows to verify that the schema rebuilds cleanly from migrations.
- If local changes were made outside migrations, use CLI diff or dump commands to capture them back into source control.
- If the repo uses seed data, keep `supabase/seed.sql` aligned with the current schema.

## RLS Basics

- Enable RLS on tables in exposed schemas, especially `public`.
- Write policies with explicit `TO authenticated` or `TO anon` targets instead of relying on broad defaults.
- Remember that Supabase maps requests into `anon` or `authenticated` Postgres roles.

## Common Policy Pitfalls

- `auth.uid()` is `null` for unauthenticated requests. Make the authentication requirement explicit instead of relying on silent SQL failure.
- `UPDATE` needs a matching `SELECT` policy or it will not behave as expected.
- Do not store authorization facts in `raw_user_meta_data`; users can edit that. Use `raw_app_meta_data` or database tables you control.
- Add indexes for columns used in policy predicates and frequent joins.

## Performance and Maintainability

- Keep policy predicates simple and auditable.
- For hot policy paths, Supabase documents the `(select auth.uid())` and `(select auth.jwt())` pattern as a way to let Postgres cache stable helper results per statement.
- Avoid broad joins in policies when a set-based lookup or helper function can express the rule more directly.
- If you add `security definer` functions for policy support, keep them out of exposed schemas.

## Type Safety

- If the repo uses generated database types, regenerate them after schema changes.
- Supabase CLI supports generating types from linked or local databases.
- Keep the generated types in sync with migrations before changing TypeScript query code that depends on new columns, RPCs, or tables.
