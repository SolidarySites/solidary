# AGENTS.md — Maintainable TypeScript + TSX Rules

Write code a human can maintain. Optimize for clarity, reuse, and predictable structure.

## Core rules

- Small files, single responsibility.
- Compose reusable components; avoid giant route files.
- File structure mirrors route ownership and shared ownership.
- Explicit typing at boundaries (props, events, API input/output).
- No `any`, no unsafe casts, no magic strings for control flow.

## Current app structure (source of truth)

Use this as the default layout for this app:

```text
src/
  main.tsx
  index.css
  App/
    App.tsx                 # app shell + router wiring
    App.css                 # shared app styling
    assets/                 # app-local static assets (avoid starter leftovers)
    components/             # shared app UI (header/footer/layout blocks)
    features/               # cross-route business domains (auth, site-draft)
      <feature>/
        components/
        hooks/
        providers/
        services/
        context/
    hooks/                  # shared app-wide hooks outside route/feature ownership
    lib/                    # pure helpers (slug/base64/supabase bootstrap)
    routes/                 # route modules (thin route entrypoints)
      <route>/
        <Route>Route.tsx
        components/
        hooks/
        services/
        index.ts
    services/               # shared network adapters
    types/                  # shared app-level types
  templates/                # raw scaffold templates written into provisioned repos
    astro/
```

## Ownership rules

- Keep route-only code inside `src/App/routes/<route>/...`.
- Promote cross-route domain logic to `src/App/features/<domain>/...`.
- Keep shared presentation/layout components in `src/App/components`.
- Keep shared app-wide hooks that are not route- or feature-scoped in `src/App/hooks`.
- Keep pure utilities in `src/App/lib`.
- Keep network and external I/O in `services/` (route-scoped or `src/App/services`).
- Keep repository scaffold templates only in `src/templates`; do not mix runtime app logic into template files.

## Thin route rule

`src/App/routes/<route>/<Route>Route.tsx` should:

- read params and navigation state
- call route hooks/services
- handle loading/error shells
- compose section components

Everything else moves into `components/`, `hooks/`, and `services/`.

## File size limits

Targets for `.ts` and `.tsx`:

- Components: 200 LOC
- Hooks: 120 LOC
- Services: 200 LOC

When approaching limits, extract subcomponents, hooks, and pure helpers. These are guides, not hard caps. Netlify functions are not subject to these targets.

## Components

- Prefer composition over configuration.
- Avoid deep JSX trees; extract named subcomponents early.
- One primary component per file.
- Keep components controlled via explicit props.

Props:

- Use `type` for props and unions.
- Prefer discriminated unions for variants.

## Hooks

- A hook does one job and returns a small API.
- Keep hook outputs stable and predictable.
- Separate concerns: data loading, state management, action helpers.

## Services and boundaries

- No network calls inside components.
- Validate/parse responses at service boundaries.
- Services return typed domain objects, not raw API blobs.

## State

- Keep state local by default.
- Introduce shared/global state only when multiple distant routes need it.
- Keep state shape explicit and stable.

## Errors, loading, and UX

- Always represent loading, error, and success states.
- Prefer early returns over nested conditionals.
- Add route-level error boundaries where it improves resilience.

## Naming and exports

- Components: `PascalCase.tsx`
- Hooks: `useX.ts`
- Utilities: `camelCase.ts`
- Tests: `*.test.ts(x)` colocated

Exports:

- Prefer named exports.
- Use `index.ts` only as folder boundaries with minimal re-exports.

## Avoid

- One file implementing an entire screen with hundreds of lines.
- Mixed concerns (fetch + business rules + complex UI in one component).
- Giant `utils` dumping grounds.
- Re-export pyramids that obscure origins.
- Untyped objects controlling behavior.

## Before finishing any change

- Structure matches UI ownership (route vs shared).
- Reuse extracted appropriately (`components/`, `features/`, `lib/`, `services/`).
- Boundaries are typed and validated.
- Loading/error/success states are handled.
- New interactive UI meets accessibility baseline.
- Non-trivial logic has tests.
