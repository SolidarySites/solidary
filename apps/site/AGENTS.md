# AGENT.md — Maintainable TypeScript + TSX Rules

Write code a human can maintain. Optimize for clarity, reuse, and predictable structure. Build UI from small, composable modules.

## Core rules

- Small files, single responsibility.
- Compose reusable components; avoid giant “page” files.
- File structure mirrors the UI and routes.
- Explicit typing at boundaries (props, events, API input/output).
- No `any`, no unsafe casts, no magic strings for control flow.

## UI-coherent project structure

Use this as the default layout:


src/
  app/                    # app shell, providers, routing setup
  routes/                 # route-level screens (thin)
    <route>/
      <Route>Route.tsx    # orchestration only
      components/         # route-specific UI parts
      hooks/              # route-specific hooks
      services/           # route-specific API/domain adapters
      index.ts
  ui/                     # design system primitives (Button, Input, Modal)
  components/             # shared non-primitive UI (Header, Sidebar, layouts)
  features/               # cross-route domains (auth, billing, search)
  services/               # shared clients + APIs (httpClient, analytics)
  hooks/                  # shared hooks
  lib/                    # pure utilities (formatting, helpers)
  state/                  # shared state utilities (only if truly global)
  types/                  # only when not better colocated



## Rules:

- Route folders map to screens. If it appears only on one screen, keep it in that route.
- `ui/` is primitive, presentation-focused, app-agnostic.
- Cross-route domains live in `features/<domain>/...`. <domain> means business capability (auth, billing, search), not a web/network domain.

## “Thin route” rule

`<Route>Route.tsx` does:
- read params
- call hooks/services
- handle loading/error shells
- compose sections

Everything else moves into `components/`, `hooks/`, `services/`.

## File size limits

Targets for .ts and .tsx:
- Components ≤ 200 LOC
- Hooks ≤ 120 LOC
- Services ≤ 200 LOC

When approaching limits: extract subcomponents, hooks, and pure helpers. These are guides only. In certain cases it may be impossible to keep files within limits. That's ok, but only as a last resort. Netlify functions are not subject to these LOC targets.

## Components

- Prefer composition over configuration.
- Avoid deep JSX trees: extract named subcomponents early.
- One primary component per file.
- Controlled via explicit props; no hidden global dependencies.

Props:
- Use `type` for props and unions.
- Prefer discriminated unions for variants.

## Hooks

- A hook does one job and returns a small API.
- Keep hooks stable and predictable (avoid returning new objects/functions unnecessarily).
- Separate concerns: data fetching, form/state management, action/command helpers.

## Services and boundaries

- No network calls inside components.
- All I/O goes through `services/` (route-scoped or shared).
- Validate/parse responses at the boundary; convert to domain/UI-friendly shapes before rendering.
- Services return typed domain objects, not raw API blobs.

## State

- Keep state local by default.
- Introduce shared/global state only when multiple distant routes need it or persistence/session requires it.
- Keep state shape stable and explicit.

## Errors, loading, and UX

- Always represent: loading, error, success.
- Prefer early returns over nested conditionals.
- Route-level error boundary where applicable.

## Naming + exports

- Components: `PascalCase.tsx`
- Hooks: `useX.ts`
- Utilities: `camelCase.ts`
- Tests: `*.test.ts(x)` colocated

Exports:
- Prefer named exports.
- Use `index.ts` only as a folder boundary (minimal re-exports, no deep chains).

## Avoid

- One file implementing an entire screen with hundreds of lines of JSX.
- Mixed concerns (fetch + business rules + complex UI in one component).
- Giant “utils” dumping ground.
- Re-export pyramids that obscure origins.
- Untyped objects controlling behavior.

## Before finishing any change

- Structure matches UI ownership (route vs shared).
- Reuse extracted appropriately (`ui/`, `components/`, `features/`).
- Boundaries typed and validated.
- Loading/error/success handled.
- New interactive UI meets accessibility baseline.
- Non-trivial logic has tests.
