# Supabase setup

## GitHub OAuth only
1. Open Supabase Dashboard → Authentication → Providers.
2. Enable GitHub and add your GitHub OAuth app Client ID/Secret.
3. Set the redirect URL to:
   - Local dev: http://localhost:5173
   - Production: your deployed studio URL
4. Leave other providers disabled.

## Local dev
- Copy `apps/studio/.env.example` to `apps/studio/.env` and fill in your project values.
- Apply migrations with the Supabase CLI:
  `supabase db push`
- Optional seed: `supabase db seed --file supabase/seed.sql`

## Edge functions
- No Supabase Edge functions are required for the studio publish flow at this time.
