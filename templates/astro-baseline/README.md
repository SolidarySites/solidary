# Astro Baseline
A boring, production-ready Astro starter.

Astro Baseline is an HTML-first starter designed for developers who want a clean foundation, not a framework demo.

No UI kit.<br>
No runtime JavaScript by default.<br>
No magic.

Just solid structure, senior defaults, and a clear separation of concerns.

## Philosophy

Astro Baseline follows a simple rule:

**HTML is the source of truth.**

- Structure lives in `.astro` files
- Content lives in data (`site.ts`, Markdown, YAML, etc.)
- Behavior is opt-in and explicit
- CSS is boring, predictable, and layered

This starter is meant to disappear once you start building.

## What you get

### Structure

- Clean layout system (`Base.astro`)
- Header / Footer components
- Skip link for accessibility
- 404 page included
- Predictable file organization

### SEO (done properly)

- Centralized SEO.astro component
- Canonical URLs
- Open Graph & Twitter cards
- JSON-LD support (opt-in, per page)
- Robots meta handling
- Theme color

### Accessibility basics

- Skip link (SkipLink.astro)
- Semantic HTML
- Focusable main content
- No JS-only interactions

### CSS architecture

No framework. No Tailwind by default.

Layered CSS structure:

```
src/styles/
├─ global.css
├─ partials/
│  ├─ tokens.css      // design tokens (colors, spacing, fonts)
│  ├─ reset.css       // minimal reset
│  ├─ fonts.css       // @font-face declarations
│  ├─ behaviors.css   // behavior-related CSS (x-dialog, etc.)
│  └─ structure.css   // layout & base styles
```

- BEM-friendly
- Easy to delete or replace
- Easy to extend

### Fonts

- Fonts served from `/public/fonts`
- Explicit @font-face
- No external font dependency by default

### Configuration as data

All site metadata lives in one place:

```
// src/content/site.ts
export const site = {
  name,
  description,
  url,
  locale,
  author,
  nav,
  seo
};
```

Used consistently across:

- Header
- Footer
- SEO
- Pages
- JSON-LD

No duplication.

## Layout API

The layout is explicit and declarative.

Example:

```
<Base
  title="Contact"
  description="Get in touch"
  canonicalPath="/contact"
  mainCentered
>
  ...
</Base>
```

Supported layout flags:

- `mainCentered` (example)
- Easy to extend (`mainWide`, `mainNarrow`, etc.)

The layout never guesses.
Pages declare intent.

## JSON-LD (opt-in)

JSON-LD is rendered only if provided.

Example:

```
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: site.name,
  url: site.url
};
```

Passed directly to the layout:

`<Base jsonLd={jsonLd}>`

No JSON-LD pollution by default.

## Environment

Astro Baseline expects the following environment variable:

`SITE_URL=https://example.com`

Create a `.env` file:

`cp .env.example .env`

Update `SITE_URL` with your domain.

Used for:
- Canonical URLs
- JSON-LD
- SEO consistency

Documented, explicit, predictable.

## Who this is for

This starter is for developers who:

- Prefer HTML over abstractions
- Care about SEO and accessibility
- Want a clean base, not opinions forced on them
- Are tired of over-engineered starters

If you want a UI kit or heavy interactivity out of the box, this is not for you.

## Who this is not for

- Page builders
- No-code tools
- “Install and ship in 5 minutes” demos
- Framework-centric mental models

## Extending Astro Baseline

Astro Baseline is designed to pair naturally with:

- **Astro Content Collections**
- **Build-time tools** (e.g. Frontmatter Core)
- **HTML-first behavior layers** (e.g. Web Components, Alpine.js)
- **Progressive enhancement**

You add complexity only when you need it.

## License

MIT

Do whatever you want.
Build good websites.

# About Astro

> Astro is an all-in-one web framework for building websites. 

- Astro uses island architecture and server-first design to reduce client-side JavaScript overhead and ship high performance websites.
- Astro’s friendly content-focused features like content collections and built-in Markdown support make it an excellent choice for blogs, marketing, and e-commerce sites amongst others.
- The `.astro` templating syntax provides powerful server rendering in a format that follows HTML standards and will feel very familiar to anyone who has used JSX.
- Astro supports popular UI frameworks like React, Vue, Svelte, Preact, and Solid through official integrations.
- Astro is powered by Vite, comes with a fast development server, bundles your JavaScript and CSS for you, and makes building websites feel fun.

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
