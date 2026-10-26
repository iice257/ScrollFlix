# R: Production regression audit, loading pipeline, Watch, SEO groundwork

Branch `ice/serene-knuth-1udtez`, cut from `origin/staging` at 1c7b780 (the sha
production reports in `/version.json`). One report: what was broken, why, what
changed, what is verified, what is left.

## How this was measured

- `scripts/perf/load-probe.mjs` opens the site in Chromium and records the
  loader's percentage over time, when the globe became ready, which film the
  page shows as active over time, TMDB image requests and bytes per size,
  the engine's LOD state and console errors. `--phone` is a 390x844 DPR 3
  touch profile; the desktop profile is 1440x900 and reports 8 cores and
  8 GB (the app treats 4 cores as a lightweight device, which this container
  is).
- `scripts/perf/card-probe.mjs` taps the poster in the middle of the globe and
  records the card poster's load states and every TMDB request after the tap,
  with failures.
- "Before" is production (scrollflix.app, 1c7b780). "After" is this branch,
  built and served by `vite preview`. Both load posters from TMDB through the
  same proxied network with software WebGL, which is far slower than a real
  phone or desktop: absolute times are not what visitors see, the comparison
  is. Production also sits behind Vercel's CDN while the preview is local, so
  the HTML, script and catalogue arrive faster in "after"; the poster work
  (most of the time) is the same network for both.

## Audit

Each line: the symptom, its cause, the evidence, and its state now.

| # | Symptom | Cause | Evidence | Now |
|---|---|---|---|---|
| A1 | Card: medium image, then a peach fill with a broken-image icon, then the sharp image seconds later | TMDB answers a no-CORS request without CORS headers and lets it be cached for a year. The poster-flight ghost drew its images as CSS backgrounds (no CORS) since 528b4c9; the card's CORS `<img>` for the same URL then failed against that cached copy. The w154 base had no retry (broken icon over the `placeholderColor` fill); at DPR 1 the flight and the main image shared w342, so the main image errored and came back on its 1.5 s retry | Confirmed on production with `card-probe`: the flight's `w154/<poster>` request, then the card's request for the same URL failing with `net::ERR_FAILED`; card sharp after 2.6 s. Headers checked with curl | Fixed (829aa32) |
| A2 | Card preparation sometimes instant, sometimes slow | Instant when the URL was already cached with CORS (the globe's opened poster, an earlier open, the session's decoded set, or a DPR 1 srcset picking w342). Slow when the srcset picked w500/w780 (DPR 1.25 and up), files nothing had fetched (up to 224 KB), plus A1's error path. The card image had no fetch priority and opening a card paused nothing: 12 globe downloads, the similar-movies row and the backdrop all competed | Code reading plus `card-probe` (w780 at DPR 2 on production) | Fixed (829aa32) |
| A3 | Fresh loads start on one film, then switch to Con Air | The desktop globe laid out 2,160 films but the catalogue's first chunk holds 2,000. The full catalogue arriving changed the globe's films, so the engine was rebuilt, and only the first build turned to the landing film: the rebuilt globe opened at its default front, which is item 1112 of a 2,160 layout, Con Air, and the engine reported it as the active film. The rebuild also emptied the atlas (black globe, every poster again) | Reproduced on production: landing film "The Hangover Part II", then at 43.6 s "AVP" (the 2,000 layout's front), then "Con Air" | Fixed (b5725cc): no rebuild, every rebuild faces the film on show. "Switches back" was not reproduced: the sequence is landing film, then Con Air for good |
| A4 | Skip shows a black globe, posters appear one by one | 5ad584c removed the sprite placeholder: a slot without its poster drew near-black on a black wall | Code and history (e542332 added the sprite, 3d1f62c limited it to failures, 5ad584c removed it) | Fixed (6bc3975): every slot shows a pixelated placeholder from the first frame |
| A5 | Loader climbs to 50-60%, then jumps to 100% | Progress counted every poster on the globe, the back included, and the globe opened on timers: 92% after 4 s, a one-off 75% check at 9 s, and a 25 s safety net that reported 100 at once. Nothing counted the script or the catalogue | Reproduced on production: 65% at 28.4 s, then 100% (the safety net) | Fixed (6abdc32), see the Smart Loader below |
| A6 | Globe posters pixelated first, sharper later | The base atlas asks w92 first into 64x96 (desktop) or 48x72 (phone) cells, while front posters are drawn ~110 CSS px wide on desktop. The mid tier only switched on after the whole globe had loaded, and its requests queued behind every base request (24 loops kept the 12-slot queue full of higher-priority base jobs) | Probe: 0 mid layers resident before ready on production | Fixed (5fbfc0c) |
| A7 | Phone globe shows far fewer films, wide gaps | 5ad584c raised the phone globe from 900 to 1,260 posters; the sphere and camera grew with it, so front posters came out ~1.2x larger with the same gaps | Probe: 62 posters drawn at least half the size of the largest on a 390x844 phone | Fixed (82dfb82): 138 |
| A8 | Index first rows slow | The device warmed the first 80 films alphabetically; the index opens newest first, then A-Z | Code | Fixed (ced3763) |
| A9 | "Not listed on any streaming service in Nigeria yet." and wrong countries | `/api/watch` took the country from the visitor's IP but let the CDN keep the reply for a day under a URL with no country in it: the first visitor's country could be served to everyone opening that film. The sentence itself was built from that country. Links are search pages; Amazon was always amazon.com | Code (`api/_lib/watch.ts`, `watch-options.tsx`) | Fixed (ed08ae2) |
| A10 | "Popular images cached on the server" | Never built: no image proxy, no Vercel image optimisation, nothing in docs. Hashed scripts were served `max-age=0, must-revalidate` (a revalidation round trip for 224 KB of script on every visit) | curl on production | Hashed assets immutable (ced3763); no proxy, see "Considered, not done" |
| A11 | Next-shuffle preloading of ~3 films | Never wired in: `shuffle-preroll.ts` exists only on the unmerged `fix/globe-images` | Branch diff | Built as a pool of 3 (8fa2bb7) |
| A12 | Rim posters held the loader | Found while fixing A5: posters at the globe's rim are on screen but face the viewer least, so the loader's facing-ordered queue asked for them after ~1,000 others; the first desktop run waited 25 s on 10 of them | `__scrollflixDebug.load()` at ready | Fixed (6abdc32): on-screen posters are queued first |
| A13 | Any CSS-background poster can poison the cache | The card's blurred backdrop fallback loads a poster's w185 as a CSS image; w185 is the desktop mid tier since 5ad584c. The phone now-playing bar, party posters and the no-WebGL grid used plain `<img>` | Code | Fixed (829aa32), with a test that fails on any `<img>` without `crossOrigin` |

`main` is 7 commits behind production: production was promoted from a
`staging` deploy (version.json reports `ref: staging`) without `staging` being
merged into `main`. The next promotion should bring `main` up to `staging`
first, or the promote PR will carry #52, #53 and #56 along with this work.

### Fixes in earlier work, and what happened to them

From Git, not memory:

- Black globe: e542332 drew the sprite into every cell straight away; 3d1f62c
  limited it to failed posters; 5ad584c removed it from the globe (the
  regression). 85f5d44 held fades until the wall shows.
- Loader: 5393dfc bounded the first-load lock; on `main` a 3 s auto-dismiss
  hid the loader whatever the percentage; 04f2306 (C.7, staging) removed that
  and added the amber slow state. None of these touched what the percentage
  counted.
- Card: 7f1fcc4 blur-to-sharp reveal, ca5c77f retries, 528b4c9 flight from the
  sharp tier (the change that put a no-CORS w342/w500 in front of the card),
  c63de74 (C.5) decoded posters reopen sharp, 845f9ee (C.9) remount per film.
- Globe images: the C plan on `fix/globe-images` diagnosed the mask/atlas
  bleed (released as #56) and measured texture memory (desktop 152.8 of
  160 MB, phone 50 of 80 MB).

## What changed

### Smart Loader (6abdc32)

- A boot screen in `index.html` matches the loader card from the first paint,
  so the page is never blank while the script downloads. The catalogue
  manifest is preloaded with the HTML.
- The bar is split into bands, each owned by a real milestone: the app
  starting (0-5), the first catalogue chunk's bytes as they stream in (5-35),
  the globe built with a placeholder in every slot (35-45), and the posters
  on screen settled (45-100). Within the current band the bar creeps toward
  the band's end without reaching it, so it keeps moving while work is
  outstanding, catches up quickly when work completes, and never goes
  backwards (`loader-state.ts`, unit tested).
- Ready means every poster on screen has settled (loaded, or failed after its
  quick retries and kept its placeholder). The back of the globe fills in
  after the loader. The 25 s safety net still ends a stalled wait, but no
  longer reports 100.
- The amber slow state now watches real progress, not the creeping bar.

### Globe

- Placeholders (6bc3975): the shader draws a 4x6 grid of blocks around the
  film's catalogue colour (a muted random colour without one) for any slot
  whose poster has not arrived or failed. No request, no decode, no texture
  upload beyond one texel per film. Posters fade in over them. Failed posters
  keep them, so the flat average-colour cell is gone.
- Image tiers (5fbfc0c): LOD runs from the first frame. A poster drawn large
  enough to need its mid tier fetches that size once, and the worker draws the
  one download into both its atlas cell and its mid layer (`requestCells`).
  Posters out of view queue behind the tiers of posters in view.
  - Desktop: w185 into 154x231 for posters in view (17 such posters on the
    1440x900 probe), w92 into 64x96 for the rest.
  - Phones: a lighter mid tier, w154 into 104x156, in a pool of 160 layers
    (45.9 MB of texture in total, against 50 MB before). Phones draw posters at
    most ~90 device px wide because the canvas caps DPR at 2.
  - Detail tier: w342 into 342x513, now also for the opened poster on dense
    screens. The w500 it used to fetch was scaled down into the same 342 px
    layer.
  - w92 stays as the base tier for the back of the globe. It is never shown
    large: as a poster comes into view it gets its mid tier.
- Con Air (b5725cc): the desktop globe lays out the catalogue's first chunk
  exactly (2,000 films), and a test keeps the two in step. Every rebuild
  (filters, moods) faces the film on show. The title no longer flashes the
  catalogue's first film before the landing pick.
- Phone density (82dfb82): on viewports up to 900 px, posters are drawn
  1.42x larger against their spacing and the camera sits slightly further back
  (zoom 0.97 instead of 1.085). That gives 138 posters drawn at least half the
  size of the largest, against 62, each about the same size as before. A
  test checks neighbours never touch. Desktop is unchanged.

### Load-time work (bd0a808)

- Mid and detail layers arrive with their own mip levels (the worker draws
  them from the one download), so the 320-layer array is never re-mipped as
  a whole each time a poster lands.
- The shader works out a slot's placeholder only where it shows.
- The globe's progress stops being page state once the gallery is up. It
  used to re-render the whole page for every percent.
- Merging the rest of the catalogue waits until the globe is still (no press,
  spin or Shuffle Pro run) unless the index, search or filters need it.

### Card (829aa32)

- One CORS copy per URL: the flight ghost draws `<img crossOrigin>` layers;
  the now-playing bar, party posters and no-WebGL grid ask with CORS; the
  backdrop fallback gets its own cache key (`?no-cors`; TMDB ignores the
  query). `app/cors-images.test.ts` fails the build on any `<img>` without
  `crossOrigin` or a poster drawn as a CSS background.
- The card shows w342 first: the file the globe's opened poster, the flight
  and the shuffle pool fetch, so one download serves all of them. On dense
  desktop screens (rendered width x DPR > 393 px) w500 then fades in over it,
  once decoded. Phones keep w342. w780 is gone from the card (it stays for the
  share card).
- Painted layers stay painted: thumbnail, then w342, then w500, each shown
  only once decoded. A failed thumbnail disappears instead of leaving a
  broken-image icon.
- Priorities: the card's poster asks at high priority, similar-movie
  thumbnails at low. While a card is open the globe's loader runs 3 slots
  instead of 12, and the opened poster still jumps its queue.

### Shuffle pool (8fa2bb7)

Three films are drawn with the shuffle's own rules (any film on the globe but
the current one, leaning toward saved taste). Their w342 card posters are
fetched at low priority, with CORS. A shuffle lands at random on a candidate
that has loaded, else on a fresh draw. The pool tops up 1.5 s after each
shuffle, so refills never compete with the card that shuffle opens. The
"decoys" idea from `shuffle-preroll.ts` is covered by the pool itself: the
next film is a random choice among several loaded ones, never one committed
pick.

### Index and caching (ced3763)

- The device's starter set now warms the index's first 30 rows under the
  default sort (`firstByRules`: the index's own comparator, one pass over the
  catalogue). It uses the thumbnail size the rows use on that screen. The
  set follows the catalogue: it is recomputed when more films arrive.
- Hashed `/assets/*` files are `immutable` for a year; the two unhashed files
  in `public/assets` are not (tested). `/media` is 30 days.
- Catalogue chunks after the first are fetched at low priority.

### Watch (ed08ae2)

- Country: a reply is shared by the CDN only when its country is in the URL.
  The first request (country from the visitor's IP) is private, and the
  client names that country in every later request. Tested both ways.
- States: confirmed listings for the country; no listing ("No verified
  streaming listings for this film.", no service or country named); failed
  (retry). A country is named only beside real listings for it.
- Each row says what it opens: the service's search ("Search") or the film's
  TMDB listing ("Listing"). Amazon follows the country: Prime Video's own site
  for the subscription, the country's Amazon store for rent or buy, Prime
  Video search where there is no store.
- "Where to watch" is now "Watch". Beside it sit up to three logos of services
  JustWatch confirms for streaming or free in the visitor's country, one per
  brand (Paramount's tiers and channels are one badge). They show only once
  their logos are decoded, and are fetched 0.7 s after the card opens so the
  poster goes first. With nothing confirmed, there are no badges.

## Results

Before: production. After: this branch's production build. Same network,
software WebGL (see "How this was measured"). Single runs unless noted.

| Measure | Desktop before | Desktop after | Phone before | Phone after |
|---|---|---|---|---|
| Something on screen | 1.8-2.1 s (blank until the script runs) | 0.06 s (boot screen) | 1.6 s | 0.03 s |
| Loader at 25 / 50 / 75% | crawls 1% per ~0.4 s | 0.9 / 3.9 / 4.7 s | crawls | 0.7 / 3.6 / 6.5 s |
| Gallery ready | 28.4-29.3 s: the 25 s safety net, jumping from 36-65% to 100 | 8.8 s: the 56 posters on screen settled, no jump | 28.3 s: safety net, 51% to 100 | 14.0 s: 297 on screen settled, no jump |
| Posters on screen at their sharper tier when ready | 0 | 17 | 0 | 24 |
| Active film over the first minute | landing film, then AVP, then Con Air (at 43.6 s) | the landing film throughout (60 s) | not affected (no rebuild on phones) | same |
| Posters drawn at least half the largest's size (390x844) | | | 62 | 133-138 |
| Poster texture memory | 152.8 MB | 148.3 MB | 50 MB | 45.9 MB |

Card, tapping the poster in the middle of a loaded globe:

| | Before | After |
|---|---|---|
| Desktop DPR 2 | sharp 2.6 s after the tap, one CORS failure (the w154 thumbnail) | sharp 51 ms after the card appears, no failures |
| Desktop DPR 1 | (same URL shared by flight and card: error, 1.5 s retry) | sharp 143 ms after the card appears; the only failed request is a globe tier the card's opening cancelled on purpose |
| Phone | | sharp 239 ms after the card appears |
| Shuffle onto a pooled film | no pool | sharp 16 ms after the card appears |

Image traffic: on desktop, the first 17 posters on screen now fetch w185 once
(about 18 KB each) instead of w92 then w185 later. On a phone, posters drawn
larger than 72 device px fetch w154 (12 KB) in the first pass. The back of
the globe still loads w92 (about 6 KB). The three shuffle candidates add three
w342 (about 40 KB each), fetched at low priority once the globe is up.

Checks: `npm run check`, `tsc -b` and `vitest` pass (878 tests). The
Playwright suite was run locally with Chromium and software WebGL (CI uses its
own browsers): 52 passed, 7 skipped. Two specs failed intermittently here and
fail on unmodified `staging` too. The Shuffle Pro hold specs were made
deterministic (they now wait for the globe to be ready before timing a
hold). `globe-lines` "Esc dismisses the tips first" stays flaky as before.
Running that suite also showed two real costs, fixed in bd0a808:

- A whole-page re-render for every percent of globe progress after the
  loader had gone.
- The rest of the catalogue merging (over a second of main thread) in the
  middle of a hold or a spin.

## Considered, not done

- **Server cache or proxy for popular posters.** TMDB's CDN (Bunny) already
  serves posters with a one-year `Cache-Control`. A proxy on Vercel would put
  every poster byte on Vercel's bandwidth bill and add a hop, and it would not
  help a cold browser, which is the slow case. The browser-side caches (HTTP
  cache, the service worker's `tmdb-img-v1`, the device poster cache) already
  cover repeat visits. The C plan reached the same conclusion for a
  self-hosted atlas.
- **Dropping w92 entirely.** It is 5.4 KB against 12.4 KB for w154 and fills
  64x96 cells exactly. It is now only the base for posters out of view, which
  get their mid tier before they are seen large.
- **Watch badges in the dock.** The dock follows the active film as the globe
  spins; badges there would mean a request per passing film. They stay on the
  card.
- **Deep links to Netflix and Amazon titles.** No service publishes stable
  per-film links without a partner agreement or a paid catalogue API; see
  below.

## Still open

- **Index order before the full catalogue arrives.** If the index opens before
  the full catalogue has loaded (on desktop the full catalogue starts as soon
  as the globe is ready), it lists the films loaded so far, then re-sorts when
  the rest arrive. This is unchanged and not verified as a problem; a
  build-time "index head" in the catalogue release would fix it if it shows
  up.
- **Visual baselines.** The loader card, the placeholder globe and the Watch
  button change pixels on purpose. CI owns the baselines
  (`playwright-tests/visual/README.md`) and needs to regenerate them.
- **Real-device numbers.** Every time above comes from software WebGL behind a
  proxy. The next production deploy should be checked on a real phone (cold
  and warm), especially the phone mid-tier pool size against the visible
  count.
- **`fix/globe-images`, `fix/globe-crop` and `fix/ui-batch`** are still on the
  remote. The last two are merged; the first holds the C plan doc and the
  unwired preroll module the shuffle pool replaces. They were left for the
  owner to delete.

## TV series ("coming soon")

The "Siri coming soon" sighting was the disabled **Series** entry in the mode
menu (`test-gallery.tsx`, `{ id: 'series', label: 'Series', meta: 'Coming soon' }`).
There is no Siri code. Series support would need a separate catalogue (TMDB
`/tv`: seasons, episodes and their own watch providers), its own card fields,
and a decision on whether series share the globe with films. It is a project,
not a toggle. Until it is planned, the disabled entry promises something with
no date. Hiding it is worth considering.

## Streaming deep links: options and costs

Today's links are search pages (or TMDB's listing page), because TMDB and
JustWatch do not hand out per-title service URLs. Paid catalogue APIs do. Prices
from the providers' own pages (checked 26 Oct 2026; confirm before buying):

| Source | Free tier | Paid | What it adds |
|---|---|---|---|
| Streaming Availability API (Movie of the Night) | 1,000 requests/month | $49/month for 25k, $99 for 100k, $299 for 1M | Per-title deep links for Netflix, Prime Video, Disney+, Max, Apple TV and more, per country; links open the app when installed |
| Watchmode | 2,500 requests/month, non-commercial only | Paid plans; the Startup plan, $349/month, includes app and episode deep links | Per-title links and deep links per region |

Recommended shape, when wanted: a weekly build-time job (alongside the
catalogue build) that asks for the 2,000 globe films in the countries that
matter and stores title URLs in the catalogue. That is about 2,000 requests a
week per country with batching, which fits the $49 tier for a few countries. It
keeps runtime requests at zero and the links checkable in a PR. Keep TMDB and
JustWatch as the source of truth for whether a film is available; use the deep
link only where both agree.

## SEO: groundwork and next steps

Only `https://scrollflix.app/` is indexable today. Films live at `/?film=<id>`,
which is canonicalised to `/` and not in the sitemap. So "pages with
impressions" means the home page, and growth means giving films their own
pages.

Done now: the default share image declared 1200x630 while it is drawn at
720x378. It now declares its real size (tested).

Data needed, which this environment does not have (no Search Console access):

- From Search Console, Performance, export **Queries** and **Pages** for the
  last 3 months and the last 16 months, each split by **Device**.
- Or add a service account with read access to the property and share its
  key with the environment as a secret. The analysis can then be scripted.

What to do with it, in order:

1. **Baseline.** Record clicks, impressions, CTR and average position per query
   and per page for 28 days before any change. Changes are judged 28 days
   after Google has recrawled (URL Inspection shows the date).
2. **CTR opportunities.** For each query with real impressions (for example
   at least 100 in 3 months), compare its CTR with the CTR the site gets at the
   same position. The gaps are snippet candidates (title and description),
   checked against intent and SERP features before rewriting. Brand queries
   are judged separately.
3. **Near page one.** Queries at average positions 8-20 with meaningful
   impressions, grouped by the page that ranks. Each group gets one targeted
   change: content depth, internal links, on-page signals. Rank by
   impressions x CTR gap x confidence, divided by effort.
4. **The structural step:** indexable film pages (`/film/<id>-<slug>`) with
   server-rendered title, description, JSON-LD (`Movie`), a canonical URL and
   sitemap entries. Without them there are no film queries to win.
   `docs/seo-indexing.md` already lists it as future work; it deserves its own
   plan.
