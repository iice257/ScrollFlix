# Quality and performance: sharp posters, a full live catalogue, a smooth globe

Date: 2026-10-18. Status: approved direction ("I just want the quality and performance"); UI redesign is out of scope.

## Goal

ScrollFlix should look sharper and spin more smoothly than the original "There's nothing to watch"
(github.com/gnovotny/nothing-to-watch), and its catalogue should be bigger and fresher.

Success means:

1. Posters on the globe are crisp at rest on a DPR-2 screen, and the opened poster is crisp at full card size.
2. The globe holds 60 fps while spinning on a mid-range laptop, with every feature on (saved-film
   constellations, session path, weather, Shuffle Pro). No feature costs a frame while it is idle.
3. About 100,000 films, every one with a real poster, including this year's releases, refreshed every night
   with no manual step.
4. Each opened film shows its TMDB backdrop as well as its poster.

## Findings that shape this

**The original.**
- It has about 53,000 films (246 batches × 216), taken from a Kaggle export frozen in early 2025, with nothing newer than 2023.
- Its sharpness and speed come from three things:
  - Three tiers of pre-built GPU-compressed sprite sheets: 4×6 placeholders for every film, then 22×33, then 110×165.
  - Sharper tiers loaded only for posters near the focus point, once the globe slows down, decided in a worker.
  - High-resolution TMDB images (`w300_and_h450` poster, `w1280` backdrop) when a film is opened.
- We copy the ideas, not the 0.5 GB self-hosted sheets. TMDB's CDN already serves every size, and we hotlink it today.

**Ours, measured.**
- Data:
  - 1,056 "local" films plus 8,944 catalogue films. The catalogue was cut from the original's snapshot, which is why nothing is newer than 2023.
  - There is no year cap in code (`scripts/build-catalog.mjs:33`, `TOTAL = 10000`) and no refresh job.
- Atlas (`infinite-movie-menu.tsx:2226-2292`):
  - One 3840² RGBA atlas holding 900 cells of 128×128. Each 2:3 poster is squashed into its square.
  - No mipmaps, so the atlas shimmers when the globe is zoomed out.
  - No level of detail, so the opened poster samples the same 128² cell.
- Decoding: each image is decoded on the main thread through `new Image()`.
- Local films: the opened poster is the 192×288 file in `public/media/posters/`, stretched about 3× in the card. This is the visible blur.
- Backdrops: `backdrop_path` exists in the local data but is never shown.
- Caching: HTTP only, with a one-day lifetime (`vercel.json`).

**The spin regression.**
- `constellation-layer.tsx` draws the saved-film constellations and the session path onto a full-screen Canvas2D layer.
- It redraws on every globe frame (`control.setOnFrame(draw)`) and on its own 30 fps "twinkle" timer, even when the globe is still.
- Each redraw does all of the following:
  - recomputes great-circle arcs (26 samples per link)
  - draws `shadowBlur` glows and new radial gradients per point (both very expensive in Canvas2D)
  - calls `getPosterWorld()`, which walks all 900 instance matrices and allocates
  - calls `getProjector()`, which calls `getBoundingClientRect()` and can force a layout every frame
- Other per-frame overlays (`weather-layer.tsx`, `poster-flight.tsx`) and React state updates during a spin are suspects too. They have not been measured yet.

## Design

The work splits into three independent workstreams plus a final integration pass.

### Workstream P: frame-time budget (performance)

1. **Measure first.**
   - Add a small dev-only frame-time probe: `?perf=1` shows p50/p95/p99 frame time and long-task count.
   - Add a Playwright script, `npm run perf`, that spins the globe for a fixed time with each feature toggled and prints a table.
   - Record the baseline in the PR description.
2. **Move constellations and the session path into the WebGL engine.**
   - Draw the links as great-circle line strips and the points as glow sprites, in the same pass as the posters. The glow comes from a shader falloff, not from blur.
   - Delete the Canvas2D layer.
   - The twinkle becomes a time uniform. It only animates while the globe is already drawing, or at most at 15 fps when idle, and it stops entirely under reduced motion.
   - Recompute arc geometry only when the path or the saved set changes.
   - Look and colours (`PATH_INK`, tiers, the "you are here" ring) stay as they are.
3. **Remove per-frame layout and allocation.**
   - Cache the canvas rect; update it on resize or scroll only.
   - Keep a `Map<id, index>` for poster lookup instead of walking the matrices.
   - Avoid allocations in the render loop.
4. **Audit and fix the rest of what the measurements show:**
   - weather and poster-flight overlays
   - React re-renders while spinning (`onSpinActiveChange` and the stores)
   - the sky shader's quality probe
   - anything else above budget
5. **Budget, enforced.**
   - Spinning with every feature on: p95 at or under 16.7 ms on the dev laptop, and no feature adding more than 1 ms at p95 compared with all features off.
   - Idle: no rAF work at all.

### Workstream D: live catalogue (data)

1. **Source: the TMDB API.**
   - Seed from TMDB's public daily ID export (`files.tmdb.org/p/exports/movie_ids_MM_DD_YYYY.json.gz`, no key), keeping entries that are not adult and not video.
   - Fetch details with `/movie/{id}?append_to_response=keywords,external_ids` using a TMDB read token, at about 40 requests per second with retry and backoff.
2. **Inclusion.**
   - Has a poster, has a release year, and `vote_count ≥ MIN_VOTES`.
   - `MIN_VOTES` is tuned once, from real counts, to give about 100,000 films (expected around 10). It is not a year cap and not a count cap.
3. **Nightly refresh.** `.github/workflows/catalog.yml` runs on cron at 03:00 UTC:
   - Fetch `/movie/changes` for the window since the last run.
   - Add new IDs from the daily export.
   - Refetch only those films.
   - Re-rank by popularity and rebuild the chunks.
   - A full re-seed runs on the 1st of each month to catch anything missed.
4. **Storage and publishing, with no repo bloat.**
   - The built catalogue (chunks, text chunks and a state file holding the last-run date) is published as a GitHub Release asset `catalog-latest` (a `.tar.zst` replaced each night).
   - `npm run build` first runs `npm run catalog:pull`, which downloads and unpacks it into `public/json/catalog/`.
   - Every deploy, whether from git or from the nightly run, therefore ships the newest data.
   - The nightly workflow then calls a Vercel Deploy Hook.
   - The old 1,056-file local tier is retired, so every film comes from the one catalogue.
5. **Format.**
   - Keep the compact row arrays and the separate lazy text chunks. Add a `backdropPath` column and keep `avgColourHex`.
   - Chunks stay at about 2,000 rows so the first chunk is fast. The manifest lists chunk counts and a content hash per file, and file names include the hash.
   - Lightweight devices still load fewer chunks. Search and filters already load the rest on demand.
6. **Average colour.** Computed from the TMDB `w92` poster at build time. On a nightly run only new or changed posters are refetched.

### Workstream I: sharp images (quality)

1. **Three tiers in 2:3 texture arrays with mipmaps.** This mirrors the original's tiers, with sizes set by measured on-screen pixels.
   - Every tier is a `TEXTURE_2D_ARRAY` with a full mip chain, `LINEAR_MIPMAP_LINEAR` filtering and anisotropic filtering where available. The shader samples the best tier a poster has resident.
   - **Base:** `w92` (92×138) for all 900 posters. That is about 61 MB with mips, the same as today's atlas, but 2:3 and mipmapped.
   - **Mid:** a pool of `w185` (185×278) layers. Desktop gets about 256, phone about 96. They fill the front-facing posters nearest the view centre, and resident posters keep their layer while visible.
   - **Detail:** a pool of `w342` layers. Desktop gets about 32, phone about 12. They fill the posters nearest the focus once angular speed drops below a threshold (as the original does). The opened poster always gets one, upgraded to `w500` on DPR 2 or higher.
   - Pools recycle least-recently-visible slots.
2. **Budgets.**
   - Total texture memory must stay at or under about 160 MB on desktop and about 80 MB on phone. The builder measures real on-screen poster sizes first, then fixes the pool sizes and tier sizes to the smallest that look sharp at DPR 2.
   - No poster may sample a tier more than 1.5× smaller than its on-screen size when the globe is at rest.
3. **Decoding off the main thread.**
   - A worker fetches each image and calls `createImageBitmap` with `imageOrientation` and `premultiplyAlpha` set, then transfers the bitmap.
   - The main thread only calls `texSubImage3D` within the existing 8 ms upload slices, and generates mipmaps per layer as each one completes.
   - The worker keeps a priority queue: front-facing first, then by distance from the focus.
4. **Placeholders.** The average colour shows first, then the existing blur-to-sharp reveal once the base tier lands. The tiny sprite is dropped once every film comes from the catalogue.
5. **Details card.**
   - The poster uses `w500`, with a `srcset` of `w342`, `w500` and `w780` so the browser picks for DPR.
   - The card's blurred background becomes the real backdrop: `w780`, or `w1280` on large screens.
   - The poster flight starts from the atlas texture already on screen, so it never pops to a lower resolution.
   - The share card uses `w780`.
6. **Caching.**
   - A small service worker caches TMDB images cache-first (capped at about 4,000 entries with LRU eviction, and opaque responses avoided because we request CORS) and the catalogue JSON stale-while-revalidate.
   - Hashed catalogue files get `immutable, max-age=31536000` in `vercel.json`.
   - `index.html` gets `<link rel=preconnect href=https://image.tmdb.org crossorigin>`.
7. **Cleanup.**
   - Retire `public/media/posters/`, `public/media/single/`, the LFS rule and the generate-poster and sprite scripts once nothing references them.
   - Keep `public/media/poster-sprite.jpg` only while the About-page mosaic uses it. That page can move to a generated still later.

### Integration pass (orchestrator)

1. Merge P, then D, then I. All three touch `test-gallery.tsx`, so each builder keeps its edits there minimal and routes new logic through new modules: `perf-probe.ts`, `catalog-loader.ts`, `poster-loader.worker.ts`, `poster-sizes.ts`.
2. Re-run `npm run perf` on the merged build. It must stay within the P budget with the new texture array in place.
3. Run `npm run check`, unit tests, e2e and the build. Check visually in the browser at DPR 1 and 2, in light and dark themes, on desktop and phone sizes.

## Error handling

- **TMDB API errors.** Retry 429 and 5xx responses with exponential backoff. If more than 2% of requests fail, the nightly run aborts and keeps the previous release, so the site never ships a half-built catalogue.
- **Image errors.** When an image 404s, fall back one size (`w342` to `w185` to `w154`), then to the average colour. Retries reuse the existing back-off schedule.
- **Older browsers.** Without workers or `createImageBitmap`, use a main-thread path through `Image.decode()`. Without `TEXTURE_2D_ARRAY` (WebGL2 always has it), there is no fallback.
- **Service worker.** Opt-out by kill switch: a `sw-version` in the manifest set to `off` unregisters it.

## Testing

- **Unit tests:**
  - catalogue row encoding and decoding
  - the inclusion filter
  - merging changes into the previous state
  - the LOD scheduler (which posters get detail layers at a given speed and focus)
  - LRU pool recycling
  - TMDB size choice for a given DPR and box size
- **Pipeline:** a fixture-driven test of the nightly merge, with no network.
- **E2E:** the existing suite, plus checks that an opened film's poster `naturalWidth` is at least 500 and that a backdrop is shown.
- **Performance:** the `npm run perf` table before and after, attached to each PR.

## Out of scope

- UI redesign. That comes later and gets its own brainstorm.
- Server-side search. 100k compact rows fit in memory, so the current client search stays.
- Self-hosted compressed sprite sheets. Revisit only if the texture array misses the budget.

## Needs from the owner

1. **A TMDB API Read Access Token**, free from themoviedb.org → Settings → API. It is stored as the GitHub secret `TMDB_API_READ_TOKEN`. Without it, workstream D can be built and tested on fixtures but cannot produce real data.
2. **A Vercel Deploy Hook URL** for production, stored as the GitHub secret `VERCEL_DEPLOY_HOOK_URL`. Claude can create it with permission.
