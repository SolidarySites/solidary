# Default Template Compatibility

This document is the compatibility contract for the default Astro site template which is found at apps/site/src/templates/site/default_template of the Solidary monorepo.

It serves two purposes:

1. Reference the current builder write surface.
2. Define when template updates are safe to push to existing user sites.

## Mental model

There are three distinct layers in the default template system:

1. Static template/runtime implementation files.
2. Site-specific content, style, and media inputs.
3. Builder write behavior that may overwrite files in user repositories.

The main compatibility rule is:

Template files are safe to update across existing sites only if they continue to work with the current site-specific content contract.

That means the real risk is usually not "did a runtime `.astro` file change?" but "did that runtime file change what content files, fields, or paths it expects to exist?"

## Static template/runtime files

These files are static in the builder. They are copied as code, not generated from per-site user input.

- `astro.config.mjs`
- `src/content.config.ts`
- `src/solidary-config/site.ts`
- `src/solidary-config/solidary.ts`
- `src/layouts/Base.astro`
- `src/components/DynamicImageLoader.astro`
- `src/components/Header.astro`
- `src/components/Footer.astro`
- `src/components/SEO.astro`
- `src/pages/index.astro`
- `src/pages/[slug].astro`
- `src/pages/robots.txt.ts`

Important nuance:

- These files are static, but they are not independent of user content.
- They read site-specific markdown, CSS, and media paths at build time and runtime.
- A template push is only safe if those expectations remain backward-compatible.
- This runtime set is not the full scaffold. Some provision-time files are not rewritten after site creation and must remain compatible with updated runtime files.

Current known scaffold-only dependencies outside the runtime rewrite set:

- `src/components/SkipLink.astro`
- `src/pages/404.astro`
- `src/styles/partials/reset.css`
- `src/styles/partials/behaviors.css`
- `public/favicon.svg`
- `public/favicon.ico`

## Site-specific content contract

These files are the user-content layer that the static template reads.

### Content files

- `src/content/solidary.md`
- `src/content/header.md`
- `src/content/footer.md`
- `src/content/seo.md`
- `src/content/pages/*.md`

### Style files

- `src/styles/partials/tokens.css`
- `src/styles/global.css`
- `src/styles/partials/structure.css`
- `src/styles/partials/fonts.css`

### Metadata and media paths

- `public/solidary-media/...`
- `public/fonts/...`
- `public/.well-known/solidary.json`
- `public/.well-known/solidary-links.json`

## Content schema and path expectations

The current runtime expects the following contract to remain valid.

### `src/content/solidary.md`

Expected frontmatter fields:

- `title`
- `description`
- `url`
- `ogImage`
- `features` optional
- `robots`

`features` currently supports:

- `dynamicImageLoading` optional

Compatibility rule:

- missing `features` must continue to parse as dynamic image loading enabled
- missing `features.dynamicImageLoading` must continue to parse as enabled

Used by:

- `astro.config.mjs`
- `src/layouts/Base.astro`
- `src/components/Header.astro`
- `src/components/SEO.astro`
- `src/pages/index.astro`
- `src/pages/[slug].astro`
- `src/pages/robots.txt.ts`

### `src/content/header.md`

Expected frontmatter fields:

- `disabled`
- `fixed`
- `brandText`
- `disableBrand`

Used by:

- `src/components/Header.astro`

### `src/content/footer.md`

Expected frontmatter fields:

- `disabled`
- `fixed`
- `modules`

Each footer module is expected to contain:

- `content`
- `alignment`

Used by:

- `src/components/Footer.astro`

### `src/content/seo.md`

Expected frontmatter fields:

- `headHtml`
- `locale`
- `twitter`
- `openGraph`
- `structuredData`
- `indexFollow`

Used by:

- `src/layouts/Base.astro`
- `src/components/SEO.astro`
- `src/pages/index.astro`

### `src/content/pages/*.md`

Expected frontmatter fields:

- `title`
- `navLabel`
- `description` optional
- `javascript` optional
- `showInNav`
- `navOrder`

Used by:

- `src/content.config.ts`
- `src/components/Header.astro`
- `src/pages/index.astro`
- `src/pages/[slug].astro`

Important nuance:

- `pages/*.md` is the strictest part of the contract because it is validated through the Astro content collection schema.
- The other markdown-backed settings files are parsed through tolerant runtime helpers with fallbacks, but they still depend on stable file paths and field names.

### Style and media expectations

The runtime and content layer currently assume:

- `src/styles/global.css` imports the global style stack used by the layout.
- `src/styles/partials/structure.css` holds the main site structure rules.
- `src/styles/partials/tokens.css` is the token layer the builder edits in simple mode.
- `src/styles/partials/fonts.css` contains `@font-face` blocks for custom font uploads.
- site image assets live at:
  - `public/solidary-media/images/site-image.jpg`
  - `public/solidary-media/images/site-image_thumb.jpg`
- page-uploaded images live under:
  - `public/solidary-media/images/pages/`
  - managed page image families may include:
    - standard compression uploads: `_small`, `_medium`, `_large`
    - no-compression uploads: `_small`, `_original`
  - runtime loaders must tolerate missing sibling variants and resolve to the next available size
- user-uploaded media library images live under:
  - `public/solidary-media/images/uploads/`
- uploaded fonts live under:
  - `public/fonts/`

## Builder-managed repo write surface

This section describes what the builder can write into an existing site repository.

### Draft-only saves

Regular section saves are mostly draft persistence, not repo writes.

- metadata save updates draft state and cached `.well-known` content in Supabase
- pages save updates draft page rows in Supabase
- header, footer, head, and styles saves update draft settings in Supabase

These actions do not write the user repository by themselves.

### Full owner publish

Owner publish rewrites the full managed site payload and deletes page markdown files that were removed from the draft.

Owner publish writes:

- all static template/runtime files listed above
- `src/content/solidary.md`
- `src/content/header.md`
- `src/content/footer.md`
- `src/content/seo.md`
- `src/content/pages/*.md`
- `src/styles/partials/tokens.css`
- `src/styles/global.css`
- `src/styles/partials/structure.css`
- `public/.well-known/solidary.json`
- `public/.well-known/solidary-links.json`
- `public/solidary-media/images/site-image.jpg` when a site image is published
- `public/solidary-media/images/site-image_thumb.jpg` when a site image is published
- `public/solidary-media/images/pages/*` for draft images used in page content

### Editor publish by touched section

Editor publish is narrower than owner publish, but it still writes builder-owned files into the repo branch used for the collaboration PR.

Every editor publish currently includes:

- `astro.config.mjs`

Section-specific writes:

- metadata
  - `public/.well-known/solidary.json`
  - `public/.well-known/solidary-links.json`
  - `src/content/solidary.md`
  - `src/content/seo.md`
  - the full runtime template set from `runtime-files.ts`
- header
  - `src/content/header.md`
  - `src/content/seo.md`
  - the full runtime template set from `runtime-files.ts`
- footer
  - `src/content/footer.md`
  - `src/content/seo.md`
  - the full runtime template set from `runtime-files.ts`
- head
  - `src/content/seo.md`
  - the full runtime template set from `runtime-files.ts`
- styles
  - `src/styles/partials/tokens.css`
  - `src/styles/global.css`
  - `src/styles/partials/structure.css`
- pages
  - touched `src/content/pages/*.md`
  - deleted `src/content/pages/*.md`
  - page-uploaded images under `public/solidary-media/images/pages/*` when needed

### Live settings save

General settings live-save writes only:

- `public/.well-known/solidary.json`
- `public/.well-known/solidary-links.json`
- `src/content/solidary.md`
- `public/solidary-media/images/site-image.jpg` when a site image is changed
- `public/solidary-media/images/site-image_thumb.jpg` when a site image is changed

Connections live-save writes only:

- `public/.well-known/solidary-links.json`

### Live domain change

Live domain changes write:

- `public/.well-known/solidary.json`
- `public/.well-known/solidary-links.json`
- `src/content/solidary.md`
- `astro.config.mjs`
- `src/pages/robots.txt.ts`

Domain changes may also modify:

- `.github/workflows/deploy.yml`

This happens when switching between GitHub Pages-managed domain handling and Studio-only domain handling.

### Media and font actions

Media and font tools also write user-repo files outside the runtime template set.

Image library actions write:

- `public/solidary-media/images/uploads/*`

Font actions write:

- `public/fonts/*`
- `src/styles/partials/fonts.css`

## Safe-to-push policy

The following changes are safe to push to existing sites without a migration, as long as they preserve the current content contract.

- changing the implementation inside runtime `.astro`, `.ts`, or config files
- changing markup, layout, or rendering behavior of runtime files
- cleaning persisted builder-only image markup while preserving the rendered page content contract
- changing helper logic while keeping the same file paths and field expectations
- adding optional behavior that falls back cleanly when older content files do not provide new data
- tightening runtime parsing only when existing persisted content remains valid
- changing runtime files while preserving compatibility with scaffold-only dependencies that are not part of the runtime rewrite set

The following changes are unsafe without a migration, versioning strategy, or explicit compatibility fallback.

- renaming or removing required content files
- changing the expected frontmatter field names or field types in existing content files
- changing the Astro page content collection schema in a way that invalidates existing `pages/*.md`
- changing expected path conventions for styles, fonts, site images, page images, or `.well-known` files
- changing the meaning of existing fields without preserving old behavior
- moving runtime files to new paths if publish flows still overwrite the old paths
- assuming new CSS imports, media files, or assets exist without fallback behavior
- changing runtime file imports, props, or CSS expectations in a way that requires simultaneous updates to scaffold-only files that are not rewritten on existing sites

## Release checklist for future template pushes

Before pushing updated default template files to existing sites, confirm all of the following.

- The content contract is unchanged, or backward-compatible fallbacks have been added.
- Runtime files still work with existing `solidary.md`, `header.md`, `footer.md`, `seo.md`, and `pages/*.md`.
- The Astro page schema still accepts existing persisted page frontmatter.
- `astro.config.mjs` and `robots.txt.ts` still read `solidary.md` in a backward-compatible way.
- Style imports and media paths still match the currently published site structure.
- Updated runtime files still remain compatible with scaffold-only dependencies that are not part of the runtime rewrite set.
- Builder write paths still target only builder-owned files.
- No manual user content is being reclassified as safe to overwrite.
- Any incompatible contract change is paired with a migration, template version split, or explicit fallback.

## Practical rule for template maintenance

Treat the static runtime/template files as globally updateable code.

Treat the content, style, and media files as the site-specific data contract that must remain backward-compatible.

If a proposed template change needs the word "and" to describe it, split the decision:

- "Can the code change safely?"
- "Can the existing content contract remain valid?"

Only ship the change globally when both answers are yes.

## Source of truth

When this document needs to be updated, confirm it against these implementation sources.

- `apps/site/src/App/routes/studio/routes/site-builder/services/constants.ts`
- `apps/site/src/App/routes/studio/routes/site-builder/services/build-files.ts`
- `apps/site/src/App/routes/studio/routes/site-builder/services/publish/publishOwnerDraft.ts`
- `apps/site/src/App/routes/studio/routes/site-builder/services/publish/editor-helpers.ts`
- `apps/site/src/App/routes/studio/routes/site-builder/hooks/live-settings/useLiveSettingsPublishingActions.ts`
- `apps/site/src/App/routes/studio/routes/site-builder/services/live-domain-publish.ts`
- `apps/site/src/App/routes/studio/routes/site-builder/services/publish/shared.ts`
- `apps/site/src/App/routes/studio/routes/site-builder/hooks/style-media/useMediaImageActions.ts`
- `apps/site/src/App/routes/studio/routes/site-builder/hooks/style-media/useMediaFontActions.ts`
- `apps/site/src/templates/site/default_template/runtime-files.ts`
- `apps/site/src/templates/site/default_template/runtime/solidary-config-site.ts.txt`
