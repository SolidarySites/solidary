# Solidary Links

Solidary Links is a protocol + toolchain for building **interconnected static sites** and **server-backed archives** without central content hosting.

- **Sites are autonomous**: fully static, deployable anywhere (GitHub Pages, Netlify, custom domains).
- **Archives are indexers**: they crawl sites via HTTP, verify published datasets via hashes, and build a queryable graph in Postgres.
- **No central ownership of content**: the master database stores only identifiers, URLs, hashes, timestamps, and relationship graphs. No media blobs, no page bodies.

The system treats:
- each microsite as a “performance” (a published artifact),
- cloning/forking/restaging as a first-class lineage relation,
- “solidary links” as typed assertions between sites/documents that can be mechanically verified.

---

## Core principles

### 1) HTTP-first, static-first
Everything a site contributes must be readable with plain `GET` requests.
No GitHub API is required to ingest sites.

### 2) Proof by hash (not trust by platform)
Verification is based on **content hashes** of published datasets.
Git commit SHAs may be included as informational metadata, but are not a verification primitive unless the system also fetches git objects.

### 3) UI agnostic
The protocol is independent of frameworks, generators, themes, and frontends.
The default builder uses Jekyll; adapters exist for other stacks.

### 4) Edges are not moderated
Archives do not “contest” links. They accept link assertions as data and compute verification tiers mechanically.
Archives can contest only **projects/sites** (delist a site), which removes its assertions from the active view while retaining history.

### 5) Infinite graph depth, bounded presentation
The graph is theoretically unbounded.
UIs cap traversal depth at query time; storage does not hard-limit depth.

---

## What exists in the ecosystem

### A) Sites (microsites)
A site is static and publishes:
- discovery manifest
- snapshot descriptor
- NDJSON feeds

A site has no database.

### B) Archives
An archive is a server-backed crawler + Postgres database:
- tracks sites
- performs HTTP crawls
- verifies snapshot hashes and page hashes
- stores graph + availability history
- provides search, reverse edges (“who links to me”), and deep traversal

### C) Master database (Supabase / Postgres)
A shared registry that can track:
- all known sites
- all archives
- ingestion observations and snapshots
- global edge set and verification status
- per-archive project delisting and availability state

This master DB still stores no content blobs.

---

## Protocol: published surfaces (site side)

All paths below are **static files** served by the site.

### 1) Discovery manifest (required)
`/.well-known/solidary-links.json`

Contains:
- protocol version
- site identity
- feed pointers
- integrity anchor (hash)

This is the only URL an archive needs to discover the rest.

### 2) Snapshot descriptor (required)
`/solidary-links/snapshot.json` (or any path referenced by the manifest)

Contains:
- snapshot id
- dataset hash
- list of feed pages with per-page hashes

Archives use this to:
- detect changes via `ETag/Last-Modified`
- verify feed integrity by recomputing hashes

### 3) Feeds (required / optional)
- `/solidary-links/docs.ndjson` (required)
- `/solidary-links/links.ndjson` (required)
- `/solidary-links/archives.ndjson` (optional; only if the site curates collections)

Feeds can be single files or paginated shards. Pagination is described in the snapshot descriptor via multiple page entries.

---

## NDJSON (feed format)

NDJSON is **Newline Delimited JSON**:
- each line is a complete JSON object
- the file is a sequence of objects, not a JSON array

Example:
{"doc_id":"a",...}
{"doc_id":"b",...}

Why NDJSON:
- streamable ingestion
- append-friendly
- partial failure tolerance
- avoids loading giant arrays into memory

---

## Solidary link model

A link is an **edge** published by a site.

Each edge includes:
- `kind` (controlled vocabulary)
- `source` (site_id and optional doc_id)
- `target` (site/doc/external URL)
- `assertion` (who asserted, when)
- `evidence_url` + `evidence_hash` (hash-verifiable pointer)

### Verification tiers (mechanical)
- **asserted**: published by one site
- **mutual**: equivalent edge published by both sides with matching canonicalization and evidence hashes
- **attested** (optional): published by a designated third-party attestor site
- **stale**: edge disappeared or source site becomes inactive/delisted

No human “approval” is required to move from asserted → mutual; it is computed.

---

## Identity over time

### Stable identity
Each site has a stable `site_id` (UUID/ULID) stored in its manifest.

### URL history
Domains can change. The master DB must store:
- current canonical URL
- history of previously observed URLs for the same `site_id`

### Availability vs existence
Sites can go offline temporarily.
Archives store:
- last successful observation time
- consecutive failures
- availability state machine (active/stale/missing)

Membership is represented as events (append-only) rather than overwriting truth.

---

## Repository architecture (monorepo)

This repo is organized as:

- `apps/site/`
  - React app hosted on solidary.link
  - non-technical editing UI for site feeds and archive management
  - CodeMirror-based advanced editor
  - Supabase auth (GitHub) for identity

- `apps/functions/`
  - Netlify Functions (crawler/indexer + provisioning)
  - HTTP ingestion pipeline for site manifests/snapshots/feeds
  - Writes to Supabase with service role key
  - Optional GitHub provisioning path for creating Jekyll repos (OAuth token acting as user)

- `packages/protocol/`
  - protocol spec as code
  - JSON/Zod schemas
  - canonicalization rules
  - hashing utilities
  - NDJSON helpers

- `templates/jekyll-site/`
  - default static site builder template for GitHub Pages
  - ensures `/.well-known/` is published (Jekyll include config)
  - emits required protocol surfaces as static files

- `supabase/`
  - SQL migrations
  - RLS policies
  - RPC helpers (graph traversal, archive operations)

---

## Data model (master DB)

Master DB stores:
- sites, URL history, archive registry
- archive tracking state (per archive ↔ site)
- crawl observations and successful snapshots
- cached doc metadata (optional; still pointer-only)
- edges and verification events
- delisting decisions at the project/site level only

### Entities
- **Site**: `site_id`, canonical URL, protocol version, last manifest hash
- **Archive**: operator identity, availability window, UI caps, tracked sites
- **Snapshot**: dataset hash, feed page hashes, ingestion timestamps
- **Edge**: typed link assertion + evidence hash
- **Membership event**: added/inactive/reactivated/delisted
- **Observation**: raw fetch attempt record

### Rules
- content bodies and media are not stored
- verification uses dataset/page hashes (HTTP verifiable)
- archives never modify edges; only compute verification status and filter views by site status

---

## Default site builder: Jekyll

The default builder produces a GitHub Pages-compatible Jekyll site.

Critical constraint:
- Jekyll does not publish dot-directories by default.
- The template must include:
  - `_config.yml` with `include: [".well-known", "solidary-links"]`
  - `/.well-known/solidary-links.json` in source
  - `/solidary-links/*` feeds in source or generated

Other builders (React/Vite, Hugo, etc.) integrate by emitting the same static protocol surfaces.

---

## Security and authority boundaries

### Ingestion
Archives crawl public HTTP endpoints only.
They store hashes and pointers.

### Provisioning and edits to GitHub repos
If the hosted builder provisions or edits user repos:
- writes require GitHub-granted authority
- use OAuth token acting as the user for minimal friction
- prefer PR-based writes by default (branch + PR) for safety and history

Protocol ingestion must remain GitHub-API-independent.

---

## Non-goals
- hosting user media centrally
- acting as a CMS that owns content
- requiring any single frontend stack
- requiring GitHub APIs for archive ingestion

---

## Success criteria
- A static site can publish valid protocol surfaces and be indexed by an archive with HTTP only.
- An archive can compute a deep graph from crawled assertions with mechanical verification tiers.
- A master DB can track many archives and many sites without storing content blobs.
- The hosted builder can provision a Jekyll microsite and allow non-technical edits to protocol surfaces.

---

## Local setup

1) Studio env
- `cp apps/site/.env.example apps/site/.env`
- Set `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`

2) Functions env
- `cp apps/functions/.env.example apps/functions/.env`
- Set `SUPABASE_URL` + `CREATE_SITE_SUPABASE_API_KEY`
- Set `GITHUB_APP_CLIENT_ID` + `GITHUB_APP_CLIENT_SECRET`
- Set `GITHUB_APP_SLUG` (your GitHub App slug from settings)
- Set `GITHUB_APP_STATE_SECRET` (random long secret for callback state signing)
- Optional legacy refresh support: `GITHUB_OAUTH_CLIENT_ID` + `GITHUB_OAUTH_CLIENT_SECRET`

3) Install + run
- `npm install`
- `npm run dev` (studio)
- `npm run functions:dev` (functions)

4) Supabase migrations
- `supabase db push`
- Optional seed: `supabase db seed --file supabase/seed.sql`

## Documentation Sets

- [Abridged documentation](https://docs.astro.build/llms-small.txt): a compact version of the documentation for Astro, with non-essential content removed
- [Complete documentation](https://docs.astro.build/llms-full.txt): the full documentation for Astro
- [API Reference](https://docs.astro.build/_llms-txt/api-reference.txt): terse, structured descriptions of Astro’s APIs
- [How-to Recipes](https://docs.astro.build/_llms-txt/how-to-recipes.txt): guided examples of adding features to an Astro project
- [Build a Blog Tutorial](https://docs.astro.build/_llms-txt/build-a-blog-tutorial.txt): a step-by-step guide to building a basic blog with Astro
- [Deployment Guides](https://docs.astro.build/_llms-txt/deployment-guides.txt): recipes for how to deploy an Astro website to different services
- [CMS Guides](https://docs.astro.build/_llms-txt/cms-guides.txt): recipes for how to use different content management systems in an Astro project
- [Backend Services](https://docs.astro.build/_llms-txt/backend-services.txt): advice on how to integrate backend services like Firebase, Sentry, and Supabase in an Astro project
- [Migration Guides](https://docs.astro.build/_llms-txt/migration-guides.txt): advice on how to migrate a project built with another tool to Astro
- [Additional Guides](https://docs.astro.build/_llms-txt/additional-guides.txt): guides to e-commerce, authentication, testing, and digital asset management in Astro projects

## Notes

- The complete documentation includes all content from the official documentation
- The content is automatically generated from the same source as the official documentation

## Optional

- [The Astro blog](https://astro.build/blog/): the latest news about Astro development
