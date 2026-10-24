# Plan L: dynamic link previews

Spec: `docs/superpowers/specs/2026-10-22-social-round-design.md`. Branch: `feat/link-previews` from `origin/main`.

## Pieces

1. **`middleware.ts` (repo root)**: Vercel Routing Middleware for a non-Next project.
   - Check the current Vercel docs for the exact API: `@vercel/functions` / `next/server`-free form, `export const config = { matcher: ['/'] }`.
   - If the user agent is a link-preview crawler, return `new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400' } })`.
   - Crawler list: facebookexternalhit, Facebot, Twitterbot, Slackbot, Slack-ImgProxy, WhatsApp, TelegramBot, Discordbot, LinkedInBot, Pinterest, redditbot, Embedly, SkypeUriPreview, Applebot, iMessage's LinkPresentation (which sends the facebookexternalhit and Twitterbot tokens), Googlebot is excluded, and vkShare.
   - Otherwise return nothing, so the SPA is served. Any error also falls through to the SPA.
2. **`api/_lib/meta.ts`**: pure functions.
   - `isPreviewBot(ua)`.
   - `previewFor(url, data)`, which returns `{ title, description, image, url, imageAlt }`.
   - `renderMetaHtml(preview)` writes the `og:*` and `twitter:card=summary_large_image` tags, a canonical link, and a visible fallback body. Escape everything.
3. **`api/_lib/tmdb.ts`**: `fetchFilm(tmdbId)` calls `https://api.themoviedb.org/3/movie/{id}` with `Authorization: Bearer ${process.env.TMDB_API_READ_TOKEN}`. It has a 2.5 s timeout, returns `{ title, year, rating, posterPath, overview }` or null, and never throws.
4. **`api/og.tsx`**: an `@vercel/og` `ImageResponse`, 1200×630, on the edge runtime.
   - Query: `kind=film&id=` or `kind=default`. Plan G's follow-up adds `kind=party`.
   - **Film:** the poster on the left (from the TMDB image CDN `w500`), then the title (clamped to 2 lines), the year, the rating, and the ScrollFlix mark and name.
   - **Default:** a poster-wall collage of about 8 popular posters, the mark, "Spin a globe of 100k+ films".
   - Fonts: bundle one weight of the app's display font if its licence allows; otherwise use the Inter that `@vercel/og` provides.
   - Brand colours come from `app/styles.css`. Brand assets are in `public/` and `docs/brand/out`.
   - Cache: `public, immutable, no-transform, s-maxage=31536000` for film images, which are keyed by id.
5. **`index.html`**: point the default `og:image` and `twitter:image` at `/api/og?kind=default`, and fix the size to 1200×630.
6. **`vercel.json`**: make sure the catch-all SPA rewrite doesn't swallow `/api/*` (add an `/api/(.*)` passthrough before it, or narrow the rewrite).

## Design bar

Load `frontend-skill` before designing the cards. They should look like ScrollFlix, cinematic and poster-led, not a template. Check the image at small sizes too: WhatsApp shows a ~300 px thumbnail.

## Tests

- Vitest for `isPreviewBot` (real UA strings), `previewFor` (film found, film missing, bad id) and `renderMetaHtml` (escaping).
- Do not hit TMDB in tests.

## Verification

- `npm run check`, `npm run build` and `npm run test:unit -- --run` are green. Push the branch: Vercel's Git integration builds a preview deployment.
- Against that preview URL:
  - `curl -A "facebookexternalhit/1.1" "<preview>/?film=27205"` returns film-specific tags.
  - Fetching `/api/og?kind=film&id=27205` gives a PNG, which you save and look at.
  - A normal browser still gets the app.
- If the preview deployment is protected, report the URL; the orchestrator will check it.
- **Off-limits:** `app/cmps/views/test-gallery/**`. Parallel builders own it.

## Follow-up (sent after Plan G merges)

Add `kind=party&code=`, using `summarizeParty` / `decodeParty` from `app/cmps/views/test-gallery/party/party-link.ts`, and route `?party=` in the middleware.
