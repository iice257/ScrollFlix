# I: Sharp images, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Posters on the globe are crisp at DPR 2, opened posters are crisp at full card size, each opened film shows its real backdrop, and images decode off the main thread and are cached across visits.

**Architecture:**
- The globe gets three tiers, like the original:
  - **Base:** a mipmapped 2D atlas of 2:3 `w92` cells for all posters.
  - **Mid:** a `TEXTURE_2D_ARRAY` pool of `w185` layers.
  - **Detail:** a `TEXTURE_2D_ARRAY` pool of `w342`/`w500` layers.
- A pure LOD scheduler decides which posters get mid and detail layers, from on-screen size, focus distance and spin speed.
- A worker fetches images and runs `createImageBitmap`. The engine only uploads, inside its existing 8 ms slices.
- The DOM uses size-aware TMDB URLs (`srcset`).
- A small service worker caches images and catalogue files.

**Tech Stack:** WebGL2 (raw), TypeScript, Vite module workers, Cache API service worker, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-18-quality-performance-design.md` (Workstream I).

**Starts after P and D have merged.** It relies on:
- `TestMovie.posterPath` and `TestMovie.backdropPath` (from D)
- the engine's overlay pass and the `npm run perf` benchmark (from P)

## Global Constraints

- **TMDB sizes:**
  - posters: `w92`, `w154`, `w185`, `w342`, `w500`, `w780`, `original`
  - backdrops: `w300`, `w780`, `w1280`, `original`
  - URL: `https://image.tmdb.org/t/p/{size}/{path}.jpg`, where `path` has no leading slash and no extension, as stored by D
- **GPU texture memory:** at most about 160 MB on desktop and about 80 MB on phone (lightweight device, as `detectLightweightDevice` decides).
  - On phone the base cells may be 64×96, downsampled from `w92`.
  - The mid pool is `min(desired, gl.MAX_ARRAY_TEXTURE_LAYERS)`.
  - Desired sizes: mid 256 on desktop and 96 on phone; detail 32 on desktop and 12 on phone. Tune them down if the measured budget is exceeded.
- **Sharpness rule:** at rest, no poster samples a tier more than 1.5× smaller than its on-screen device-pixel width.
- **Performance:** `npm run perf` must stay within P's budget. Spinning with every feature on: p95 ≤ 16.7 ms, and image work adds ≤ 1 ms at p95.
- **Look:** keep the current average-colour placeholder and the blur-to-sharp reveal. A tier upgrade cross-fades over 150 ms (instant under reduced motion).
- **UI:** keep the current UI. The backdrop change in the details card is the only visual change. Use the `frontend-skill` before touching card styling, and match the existing design tokens in `app/styles.css`. Never hand-edit `app/light-theme.css`; run `npm run theme:light` after changing `styles.css`.
- **Code:** Biome style. No new runtime dependencies.

## Review Focus

- A TMDB 404 on one size: fall back `w342` → `w185` → `w154`, then the average colour. The globe never shows a black cell. Test: `poster-loader.test.ts › falls back one size on 404`.
- A fast spin while detail loads are in flight: stale requests are cancelled or dropped, and the pools never thrash. Test: `lod-scheduler.test.ts › no detail while fast`, plus `layer-pool.test.ts › evicts least recently visible`.
- A filter change that rebuilds the engine: workers, bitmaps and GL textures are released, with no leak over 10 rebuilds. This is an e2e step in Task 4, which checks `performance.memory` where available or counts live textures through a debug hook.
- A browser without `OffscreenCanvas` or `createImageBitmap` options (older Safari): the main-thread fallback works. Test: `poster-loader.test.ts › falls back to main-thread decode`.
- A service worker serving a stale manifest after a deploy: the manifest is revalidated on every load, and hashed files are immutable. Test: `sw-routes.test.ts › manifest is network-first`.

---

### Task 1: TMDB size helpers and DOM images

**Files:**
- Create: `app/cmps/views/test-gallery/poster-sizes.ts` and `poster-sizes.test.ts`
- Modify: `test-gallery.tsx`:
  - `MoviePoster` (about line 612): use `srcset`
  - the index row posters
  - the share art (about line 5830)
  - the poster flight source (about line 2264)
  - `--details-backdrop` (about lines 5803-5809)
- Modify: `app/styles.css` for the details backdrop treatment only, then run `npm run theme:light`
- Modify: `index.html`, adding `<link rel="preconnect" href="https://image.tmdb.org" crossorigin>`
- Modify: `app/config.ts`, removing the unused `backdropBaseUrl` and `posterBaseUrl`
- Modify: `.env.local.example`, removing the unused `VITE_TEXTURES_BASE_URL`, `VITE_FILM_INFO_BASE_URL` and `VITE_MEDIA_VERSION_*`

**Interfaces:**
- Produces:
  ```ts
  export type PosterSize = 'w92' | 'w154' | 'w185' | 'w342' | 'w500' | 'w780' | 'original'
  export type BackdropSize = 'w300' | 'w780' | 'w1280' | 'original'
  export const posterUrl: (path: string, size: PosterSize) => string
  export const backdropUrl: (path: string, size: BackdropSize) => string
  export const pickPosterSize: (deviceWidthPx: number) => PosterSize        // smallest size ≥ deviceWidthPx / 1.0, capped at w780
  export const posterSrcSet: (path: string) => string                        // "…/w342/x.jpg 342w, …/w500/x.jpg 500w, …/w780/x.jpg 780w"
  export const pickBackdropSize: (deviceWidthPx: number) => BackdropSize   // w780 up to 780, else w1280
  ```
- `MoviePoster size='detail'`:
  - `src = posterUrl(path, 'w500')` and `srcSet = posterSrcSet(path)`
  - `sizes` matches the CSS column `clamp(240px, 25vw, 330px)`, and on mobile `min(30dvh, 250px)` × 2/3 for width
- Index rows: `pickPosterSize(46 × dpr)`.
- Share art: `w780`.
- Details backdrop: `backdropUrl(backdropPath, pickBackdropSize(viewportWidth × dpr))`, falling back to the poster when there is no backdrop.
- Poster flight: start from the detail URL when it has already decoded (the press preloads `w342` with `decode()`), otherwise `w154`.

- [ ] **Step 1: Write failing tests:**
  - `posterUrl('abc','w500') === 'https://image.tmdb.org/t/p/w500/abc.jpg'`
  - `pickPosterSize(300) === 'w342'`, `pickPosterSize(92) === 'w92'`, `pickPosterSize(5000) === 'w780'`
  - `pickBackdropSize(1600) === 'w1280'`
  - the srcset string for `'abc'` equals the exact three-entry string above
- [ ] **Step 2: Run** `npx vitest run app/cmps/views/test-gallery/poster-sizes.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the helpers and switch every DOM image site to them. Grep `TMDB_IMAGE_URL` and `/t/p/`, and leave no hard-coded sizes.
- [ ] **Step 4: Style the details backdrop** using `frontend-skill`.
  - Show the real backdrop behind the card with a soft scrim, keeping the text readable to WCAG AA.
  - Light and dark themes, desktop and phone.
- [ ] **Step 5: Add e2e** `user-flows.spec.ts › opened film is sharp and has a backdrop`.
  - Open a film.
  - Check the poster `img.currentSrc` contains `/w500/` or `/w780/` and `naturalWidth ≥ 500`.
  - Check the backdrop element's computed `background-image` contains `/w780/` or `/w1280/`.
- [ ] **Step 6: Run** `npm run check && npm run test:unit && npx playwright test playwright-tests/user-flows.spec.ts`. Expected: PASS.
- [ ] **Step 7: Commit** with "Size-aware TMDB images in the DOM and the real backdrop behind the card".

### Task 2: Worker loader with priority and fallback

**Files:**
- Create:
  - `app/cmps/views/test-gallery/poster-loader.worker.ts`
  - `app/cmps/views/test-gallery/poster-loader.ts`
  - `app/cmps/views/test-gallery/priority-queue.ts`
- Tests: `poster-loader.test.ts` and `priority-queue.test.ts`

**Interfaces:**
- Produces: `createPriorityQueue<K>() => { push(key: K, priority: number): void; update(key: K, priority: number): void; remove(key: K): void; pop(): K | undefined; size: number }`. Lower priority number pops first.
- Produces:
  ```ts
  export type PosterImage = ImageBitmap | HTMLImageElement
  export const createPosterLoader: (opts: { concurrency?: number /* 12 */; useWorker?: boolean }) => {
    request(key: string, urls: string[] /* best first, fallbacks after */, priority: number): Promise<PosterImage>
    reprioritise(key: string, priority: number): void
    cancel(key: string): void
    dispose(): void
  }
  ```
- Worker protocol:
  - in: `{ t: 'load', key, urls, priority } | { t: 'prio', key, priority } | { t: 'cancel', key }`
  - out: `{ t: 'ok', key, bitmap } | { t: 'fail', key }`
  - The worker uses `fetch(url, { mode: 'cors' })`, then `createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })`, and transfers the bitmap.
  - Match the orientation the engine currently expects from `HTMLImageElement` uploads (check `UNPACK_FLIP_Y_WEBGL` in `infinite-movie-menu.tsx`).
- Fallback: when `useWorker` is false, or `Worker` / `createImageBitmap` is missing, use `new Image()` with `crossOrigin='anonymous'` and `await img.decode()` on the main thread.
- Fallbacks also apply per request: on a fetch failure or 404, try the next URL in `urls`. Reject only when every URL has failed.
- Keep the existing retry timings (`[800, 2400]` quick, then background `[4000, 12000, 30000]`) at the engine level, not inside the loader.

- [ ] **Step 1: Write failing tests:**
  - `priority-queue.test.ts`: `pops lowest first`, `update moves key`, `remove drops key`
  - `poster-loader.test.ts`, with a mocked `fetch`, `createImageBitmap` and `Image`, and `useWorker: false` to test the shared logic:
    - `falls back one size on 404`
    - `cancel drops a queued request`
    - `never exceeds concurrency`
    - `falls back to main-thread decode`, when `createImageBitmap` is undefined
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** The worker and the main-thread path share one queue module. Instantiate the worker with `new Worker(new URL('./poster-loader.worker.ts', import.meta.url), { type: 'module' })`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** with "Poster loader: worker decode, priority queue, size fallbacks".

### Task 3: LOD scheduler and layer pool

**Files:**
- Create: `app/cmps/views/test-gallery/lod-scheduler.ts` and `layer-pool.ts`
- Tests: `lod-scheduler.test.ts` and `layer-pool.test.ts`

**Interfaces:**
- Produces: `createLayerPool(capacity: number) => { acquire(key: string, now: number): { layer: number; evicted: string | null }; touch(key: string, now: number): void; layerOf(key: string): number | null; release(key: string): void; size: number }`. When full, it evicts the key with the oldest `touch` time.
- Produces:
  ```ts
  export type LodPoster = { index: number; key: string; visible: boolean; deviceWidthPx: number; focusDistance: number /* 0 at screen centre, 1 at globe rim */ }
  export type LodPlan = { mid: string[]; detail: string[] }  // keys, highest priority first
  export const planLod: (input: {
    posters: readonly LodPoster[]
    angularSpeed: number        // rad/s, from the engine's inertia
    openedKey: string | null
    midCapacity: number
    detailCapacity: number
  }) => LodPlan
  export const DETAIL_SPEED_MAX = 0.6  // rad/s; above this no new detail requests
  export const MID_SPEED_MAX = 2.5     // rad/s; above this no new mid requests
  ```
- Rules:
  - Mid is for visible posters whose `deviceWidthPx > 92 × 1.5`, ordered by `focusDistance`.
  - Detail is for visible posters whose `deviceWidthPx > 185 × 1.5`, ordered by `focusDistance`.
  - `openedKey` always comes first in detail, at any speed.
  - Never return more keys than the capacity.

- [ ] **Step 1: Write failing tests:**
  - `no detail while fast`: speed 1.0 gives empty detail unless the poster is the opened one
  - `opened poster always gets detail`
  - `mid ordered by focus distance`
  - `respects capacities`
  - `small posters stay base`: `deviceWidthPx` 100 gives neither mid nor detail
  - `layer-pool.test.ts`: `evicts least recently visible`, `touch protects`, `release frees layer`
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** These are pure functions with no allocations beyond the result arrays.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** with "LOD scheduler and LRU layer pool".

### Task 4: Engine tiers (base atlas, mid and detail arrays)

**Files:**
- Modify: `app/cmps/views/test-gallery/infinite-movie-menu.tsx`. Work through:
  - `initTexture` (about line 2226)
  - `loadTextureImages`, `uploadPosterCell` and the upload slices (about lines 2340-2615)
  - `fetchImage` and `posterImageCache` (about lines 2620-2700)
  - the poster fragment shader (`uTex`, about line 599)
  - `render()`
  - `dispose`
- Remove the poster-sprite placeholder code (about lines 334-381 and 2539-2580) and `scripts/generate-poster-sprite.mjs`, with its `media:sprite` script and `public/media/poster-sprite.json`.
  - Keep `public/media/poster-sprite.jpg`, because the About mosaic (`styles.css:4586`) still uses it.
- Test: `infinite-movie-menu.test.ts` (extend it), plus `playwright-tests/gallery-assets.spec.ts`

**Interfaces:**
- Consumes:
  - `createPosterLoader` (Task 2)
  - `planLod`, `createLayerPool`, `DETAIL_SPEED_MAX` and `MID_SPEED_MAX` (Task 3)
  - `posterUrl` (Task 1)
  - `InfiniteMovieMenuItem` gains `posterPath?: string`, passed from `test-gallery.tsx` at about line 3477
- Base atlas:
  - 2:3 cells of 92×138 (64×96 on phone), each with a 4 px gutter filled by extending the edge pixels.
  - Grid columns are `ceil(sqrt(n × 1.5))`, so the atlas stays near square and within `MAX_TEXTURE_SIZE`.
  - Mipmap with `generateMipmap` after each upload batch (one call per slice that uploaded something), with `TEXTURE_MAX_LEVEL = 3` and `LINEAR_MIPMAP_LINEAR` filtering.
  - Use `EXT_texture_filter_anisotropic` at `min(4, max)` when present.
  - The quad UVs map to the inner cell rectangle, so the quad's existing 2:3 aspect samples an unsquashed poster.
- Mid and detail: `TEXTURE_2D_ARRAY` textures of 185×278 and 342×513 (or 500×750 for the opened poster on DPR ≥ 2, scaled into the 342×513 layer). Detail capacity comes from Global Constraints.
  - Each layer gets its own mip chain: upload level 0, then call `generateMipmap` on the array after a slice's uploads.
- Per-instance attribute: `aLod: vec3` (midLayer, detailLayer, fade 0..1), where -1 means no layer.
  - The fragment shader samples the highest tier available and mixes from the tier below by `fade`.
  - `fade` animates over 150 ms through a per-instance start time, or is instant under reduced motion.
- Scheduling:
  - At most every 120 ms while the globe moves, and once when it settles, build `LodPoster[]` from the instance matrices already computed for picking (no new projection pass).
  - Call `planLod`, acquire layers, and `request` the missing images at priority = rank in the plan.
  - `cancel` keys that drop out of the plan before they load.
- Memory: log the computed GPU bytes once in dev (`console.info('[atlas]', …)`). They must stay within the Global Constraints.
- Disposal: delete all three textures, `dispose()` the loader, and `close()` every `ImageBitmap` once it is uploaded.

- [ ] **Step 1: Write failing unit tests** in `infinite-movie-menu.test.ts`, using the file's existing WebGL mocks:
  - `base atlas cells are 2:3 with 4px gutter`, checking computed cell rects for n = 900
  - `dispose deletes three textures and disposes loader`
  - `memory estimate within budget`: `estimateTextureBytes({ desktop: true }) ≤ 160 MB` and `({ desktop: false }) ≤ 80 MB`
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** the tiers and the shader change, wire the loader and scheduler, and remove the sprite code.
- [ ] **Step 4: Run** `npm run test:unit`. Expected: PASS.
- [ ] **Step 5: Update e2e** `gallery-assets.spec.ts`:
  - Every visible cell is filled within 25 s, with no black cells: sample canvas pixels against the sky colour.
  - Add `rebuilds don't leak`: apply and clear a genre filter 10 times, then check the live-texture count from a dev hook (`window.__scrollflixDebug?.textures`) is unchanged.
- [ ] **Step 6: Visual check** with `preview_start` on the dev server.
  - At DPR 1 and DPR 2 (`resize_window` plus device scale), zoom-crop a resting poster next to the same poster on `main`. The new one is visibly sharper and does not shimmer while spinning.
  - Save both crops in `test-results/` for the PR.
- [ ] **Step 7: Run** `npm run perf`. Expected: within P's budget. Put the table in the commit body.
- [ ] **Step 8: Commit** with "Globe posters: mipmapped 2:3 base atlas plus mid and detail LOD pools".

### Task 5: Service worker and cache headers

**Files:**
- Create: `public/sw.js`, `app/sw-register.ts` and `app/sw-routes.ts`, a pure route classifier that `sw.js` copies at build time
  - Or write `sw.js` as `app/sw.ts` and emit it with a Vite rollup input. Choose whichever keeps one source of truth for routes.
- Test: `app/sw-routes.test.ts`
- Modify: `app/main.tsx`, calling `registerServiceWorker()` in production builds only. When `import.meta.env.VITE_SW === 'off'`, it unregisters every registration instead.
- Modify: `vercel.json`, so `/sw.js` gets `Cache-Control: public, max-age=0, must-revalidate`

**Interfaces:**
- Produces: `classify(url: string) => 'tmdb-image' | 'catalog-manifest' | 'catalog-hashed' | 'other'`. The catalogue patterns come from D's naming (`/json/catalog/manifest.json` and `/json/catalog/*.[0-9a-f]{8}.json`).
- Strategies:
  - `tmdb-image`: cache-first in cache `tmdb-img-v1`, storing only `response.ok` CORS responses. After each put, when the key count exceeds 4,000, delete the oldest 400 (insertion order).
  - `catalog-hashed`: cache-first in `catalog-v2`.
  - `catalog-manifest`: network-first with a 3 s timeout, falling back to the cache.
  - `other`: passthrough, with no `respondWith`.
- On activate, delete caches whose names are not in the current set.

- [ ] **Step 1: Write failing tests:**
  - `classify` for a TMDB URL, the manifest, a hashed chunk and `/index.html`
  - `manifest is network-first`, by asserting `strategyFor('catalog-manifest') === 'network-first'`
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** the classifier, the worker, the registration and the header.
- [ ] **Step 4: Check** with `npm run build && npm run preview`, then the browser pane.
  - First load, then reload offline (DevTools network offline through CDP `Network.emulateNetworkConditions`). Globe posters and the catalogue come from cache.
- [ ] **Step 5: Run** `npm run check && npm run test:unit && npm run build && npm run test:e2e`. Expected: green.
- [ ] **Step 6: Commit** with "Service worker: cache-first posters and hashed catalogue, network-first manifest".
