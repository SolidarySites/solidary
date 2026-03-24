# Solidary Links

Solidary Links is a web app for creating, publishing, and managing independently owned websites.

The basic idea is simple: you sign in, create a site, edit it in the browser, and publish it to a GitHub-backed static site. At the same time, Solidary lets sites connect to one another and appear inside shared public indexes, so they are not just isolated personal websites floating on their own.

## What the app does

Solidary currently has two public sides and one working area behind sign-in.

- The public side lets people browse the network through the homepage, search, and an explorer view.
- The signed-in side gives site owners a Studio where they can create sites, create child indexes, manage collaborators, and edit published content.
- There is also an admin flow for index management, including setup, connection requests, collaborator access, and root-index controls.

In practical terms, this means a person can:

- create a new site backed by a GitHub repository
- create a new index, which works like a public directory or hub for connected sites
- edit pages, header, footer, SEO settings, styles, images, and fonts in a visual builder
- preview changes before publishing
- invite collaborators and manage editing locks
- publish updates to a live static site
- manage custom domains and some hosted setup details

## How it works in plain English

Solidary is made of a few connected pieces:

- The frontend is a React app in `apps/site`. This is the website people actually use.
- Supabase handles sign-in, saved draft data, collaboration state, and server-side actions.
- GitHub is where generated sites and indexes are created and published.
- The default published site template is Astro-based, and the builder writes content and settings into that template.
- Shared metadata files such as `/.well-known/solidary.json` and `/.well-known/solidary-links.json` help sites describe themselves and their connections.

So the experience is: edit in Solidary, store working state in Supabase, and publish to a static site that lives in your own repository.

## Main parts of the product

### Public routes

- **Landing page**: explains the project and shows part of the visible public network.
- **Search**: lets visitors search published sites and indexes.
- **Explorer**: shows the network as a graph so people can see how sites and indexes relate.
- **Support and Contact**: simple public information pages.

### Signed-in routes

- **Studio**: the dashboard for owned and shared sites.
- **Site create**: creates a new GitHub-backed site and prepares its first draft.
- **Index create**: creates a child index, including its repository and setup flow.
- **Site builder**: the main editing experience with preview, content editing, styling, media management, and publishing.
- **Site settings**: handles collaborators, connections, and danger-zone actions.
- **Profile**: manages display name, avatar, GitHub identity, and Supabase account connection.

### Admin routes

The repo also includes an index admin area used for managing standalone indexes and the root index. That covers setup checks, custom domains, collaborator access, and connection approvals.

## Repository layout

The repo is smaller and more product-focused than the older README suggested.

- `apps/site`
  The main React + Vite app, including the public site, Studio, builder, and template source files.

- `packages/protocol`
  Shared protocol code such as schemas, types, and hashing helpers.

- `supabase/functions`
  Edge Functions that do the heavy lifting behind the scenes. These handle things like GitHub repository creation, file reads and writes, Pages setup, collaborator management, index admin actions, connection requests, ingestion, and publish status checks.

- `supabase/migrations`
  Database schema changes for Supabase/Postgres.

- `scripts`
  Utility scripts for building, bundling, and deploying parts of the system.

## Templates and publishing

Solidary comes with built-in templates for the things it creates.

- The default site template lives under `apps/site/src/templates/site/default_template`.
- The default index template lives under `apps/site/src/templates/index/default_template`.

The site template is now Astro-based. The builder edits content and settings that are turned into markdown, metadata, CSS, and image files inside that template before publish.

## Running the project locally

Install dependencies first:

```bash
npm install
```

Useful commands:

```bash
# Run the frontend locally
npm -w apps/site run dev

# Build the shared protocol package and the frontend
npm run build

# Run frontend tests
npm -w apps/site run test

# Run linting for the frontend
npm run lint
```

If you want to test sign-in, publishing, GitHub actions, or admin flows locally, you will also need the right local environment variables for Supabase, GitHub, and related secrets. Without those, the public parts of the app can still make sense, but the connected workflows will not fully work.

## Current state in one sentence

This repo is the Solidary product itself: a browser-based publishing and network-management app for independent static sites, backed by Supabase and GitHub, with an Astro site template and a full in-browser builder.
