# Workstream B: link previews that unfurl (fix/link-previews)

## Evidence (24 Oct, production, raw output in NOTES/evidence/B)

- Crawler HTML is fine: every preview UA (WhatsApp, facebookexternalhit, Twitterbot, Slackbot, TelegramBot, Discordbot, the iMessage combo) gets a 2 KB page with film tags in 0.6 to 1.6 s, on `scrollflix.app` and (after a 308) on `scroll-flix.vercel.app`, for films 603 and 1368337. TLS chain is valid (Let's Encrypt, SAN `scrollflix.app`). Middleware runs on the custom domain. No challenge page.
- The image is the problem: `/api/og?kind=film` returns a 526 to 683 KB PNG (home card 780 KB), about 3.4 s to download. WhatsApp drops preview images over roughly 300 KB.

## Changes

1. `api/_lib/og-cards.ts` (new): card layouts moved out of `api/og.ts`; every length is multiplied by `OG_SCALE` (0.6) so the PNG is 720x378; film and party cards are flat (no soft gradients or shadows, which PNG compresses worst); the home card has 6 posters.
2. `api/_lib/og-fonts.ts`, `og-mark.ts` (new): Inter 500/800 and the app mark embedded, so a render no longer fetches jsDelivr or its own site.
3. `api/_lib/party-meta.ts` (new) + `meta.ts`/`middleware.ts`: `?party=` links get tags and `/api/og?kind=party&code=`.
4. `meta.ts`: `og:image:width/height` match the real PNG, `twitter:creator`, more preview UAs.
5. `share-output.ts`: link also in `text` beside files, `SHARE_ACTIONS` with copy-link first, `warmFilmCard`.

## Tests

`api/_lib/og.test.ts` (PNG size under 300 KB for film, party, home cards; dimensions match tags; party summary parity with the app's `summarizeParty`), `meta.test.ts` (UAs, tags), `share-output.test.ts`.
