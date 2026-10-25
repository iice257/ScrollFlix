# Workstream A: Domain and SEO foundation

Branch `feat/domain-seo`. Owns `index.html`, `public/robots.txt`, `public/sitemap*`, `scripts/generate-sitemap.js`, `vercel.json`, the runtime config in `middleware.ts`, and `SITE` in `api/_lib/meta.ts`.

1. A.1 New domains: already on main via #40 (`chore/new-domains`). Nothing to merge; credit link text stays "ICE".
2. A.2 `vercel.json` `redirects` (308, `/(.*)` -> `https://scrollflix.app/$1`, `has` host exactly `scroll-flix.vercel.app` or `what-to-watch-brown.vercel.app`). Vercel applies redirects before rewrites and forwards the query string. Tested in `app/seo.test.ts`.
3. A.3 `robots.txt`: no Disallow rules (the app fetches `/json/catalog/*` at render time, `/assets/` holds the bundle, `/media/` the placeholder); `Sitemap:` points at the index.
4. A.4 Title (59 chars), description (150 chars), no `keywords`, og/twitter in sync.
5. A.5 JSON-LD `@graph`: WebSite, Organization (logo, `sameAs` = X only), WebApplication. Parsed in the unit test.
6. A.6 `scripts/generate-sitemap.js` runs first in `npm run build`; writes `sitemap.xml` (index) plus `sitemap-<type>.xml` for non-empty types (pages today; film, lists, blog ready). lastmod = last git commit date for app/index.html/public, else today.
7. A.7 `middleware.ts` `config.runtime = 'nodejs'` (Vercel docs: Routing Middleware config).
8. A.8 King's checklist in NOTES `A-king-checklist.md`.
9. A.9 Vitest `app/seo.test.ts`; Playwright `playwright-tests/seo.spec.ts`.
