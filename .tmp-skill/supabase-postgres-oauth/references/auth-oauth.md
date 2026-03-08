# Auth and OAuth

Use this reference when changing login, logout, callbacks, server/client auth boundaries, or provider-token handling.

## Architecture Rules

- If the repo is browser-first and uses `@supabase/supabase-js`, keep the browser client pattern unless the task explicitly requires server-managed sessions.
- If the repo already uses server-side auth, use `@supabase/ssr`, separate browser and server clients, and keep session storage in cookies.
- Do not mix browser-only auth assumptions into server-protected routes or middleware.

## GitHub and Social Login

- GitHub social login setup requires:
  - A provider-side OAuth app
  - Supabase provider configuration
  - App-side `signInWithOAuth` code
- Supabase exposes the provider callback URL in the dashboard. For hosted projects it looks like `https://<project-ref>.supabase.co/auth/v1/callback`.
- For local Supabase CLI development, GitHub should use `http://localhost:54321/auth/v1/callback`.

## Flow Selection

- SPA or browser redirect flow:
  - Start auth with `supabase.auth.signInWithOAuth({ provider })`.
  - Use this when the repo is not using SSR or cookie-based auth.
- SSR or PKCE flow:
  - Call `signInWithOAuth` with `options.redirectTo` pointing to your callback route.
  - Add that callback URL to the Supabase redirect allow list.
  - At the callback route, call `exchangeCodeForSession(code)` and persist the session via the framework's cookie adapter.

## Server Trust Boundary

- On the server, do not trust `getSession()` alone for authorization-sensitive checks.
- Use the verified claims or user-validation path Supabase recommends for server protection.
- Keep browser-only session conveniences out of middleware, proxies, and privileged server handlers.

## Provider Tokens

- Supabase returns provider tokens for OAuth providers so the app can call the provider on the user's behalf.
- Supabase does not store or refresh those provider tokens for your application.
- If a provider refresh token is not returned, that usually means either:
  - The provider does not issue one
  - Additional scopes or query parameters are required
- If the app needs provider tokens outside the initiating browser tab, send them to a trusted server you control and store them securely.

## API Keys

- Publishable and `anon` keys belong in browser-safe code and depend on RLS for actual data protection.
- `service_role` and secret keys belong only in trusted server runtimes such as Edge Functions, backends, jobs, or admin tooling.
- Never move privileged keys into frontend code to bypass policy or session bugs.
