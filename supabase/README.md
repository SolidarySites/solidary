# Supabase setup

## GitHub OAuth only
1. Open Supabase Dashboard → Authentication → Providers.
2. Enable GitHub and add your GitHub OAuth app Client ID/Secret.
3. In your GitHub OAuth app settings, set **Authorization callback URL** to:
   - `https://<your-project-ref>.supabase.co/auth/v1/callback`
4. In Supabase Dashboard → Authentication → URL Configuration:
   - Site URL: your deployed studio URL (for example `https://solidary.netlify.app`)
   - Redirect URLs: add local + production URLs you use (for example `http://localhost:5173/*` and `https://solidary.netlify.app/*`)
5. Leave other providers disabled.

## Local dev
- Copy `apps/site/.env.example` to `apps/site/.env` and fill in your project values.
- Apply migrations with the Supabase CLI:
  `supabase db push`
- Optional seed: `supabase db seed --file supabase/seed.sql`

## Edge functions
- No Supabase Edge functions are required for the studio publish flow at this time.
