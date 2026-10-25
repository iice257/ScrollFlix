# D: Live catalogue, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the frozen 10k catalogue with about 100,000 TMDB films, refreshed every night, served as one catalogue. This retires the 1,056-film local tier.

**Architecture:**
- **Build:** a Node pipeline (`scripts/catalog/`) builds compact row chunks from the TMDB API, together with a state file used for merges.
- **Publish:** the pipeline output is published as the GitHub Release asset `catalog-latest`.
- **Pull at build time:** `npm run build` pulls the asset into `public/json/catalog/` before Vite runs, so git deploys and nightly deploys both ship the newest data.
- **Refresh:** a nightly workflow updates the asset and calls a Vercel Deploy Hook.
- **Load in the app:** a new `catalog-loader.ts` module replaces the loading code inside `test-gallery.tsx`.

**Tech Stack:** Node 20+ ESM scripts, using built-in `fetch` and `zlib`; `sharp` (already a devDependency) for the average colour; system `tar` (present on ubuntu-latest and on Windows 10 and later); GitHub Actions; Vitest.

**Spec:** `docs/superpowers/specs/2026-10-18-quality-performance-design.md` (Workstream D).

## Global Constraints

- **Inclusion:** a poster, a release year, and `vote_count ≥ MIN_VOTES`. `MIN_VOTES` is chosen by `--target 100000`. There is no year cap and no count cap beyond that.
- **Order:** most-voted first (`vote_count` desc, ties broken by `id` asc), as today, so the default globe stays the iconic films.
- **TMDB traffic:** read token from env `TMDB_API_READ_TOKEN`, sent as the `Authorization: Bearer` header, at no more than 40 requests per second.
  - Retry 429 and 5xx up to 5 times with exponential backoff (starting at 500 ms, honouring `Retry-After`).
  - If more than 2% of requests fail, abort and keep the previous release.
  - Refuse to publish when the new count is below 95% of the previous count.
- **Chunks:**
  - 2,000 rows per row chunk and 500 per text chunk.
  - File names carry an 8-hex content hash, as in `films-0.1a2b3c4d.json`.
  - `manifest.json` is the only file without a hash.
- **Row v2:** `[tmdbId, title, year, rating×10, genreIdx[], countryIdx, posterPath, backdropPath, avgColourHex, voteCount, popularity×10, runtimeMinutes]`.
  - Paths have no leading slash and no `.jpg`. A missing value is `''`, a missing runtime is `0`.
  - Text row v2: `[overview, tagline, imdbId]`.
- **Ids:** every film's app id is `c${tmdbId}`. Old local ids `` `${index}-${tmdbId}` `` must be migrated wherever they are stored.
- **Release:** tag `catalog-latest`, asset `catalog.tar.gz` containing `catalog/…` (the public files) plus `state/films.ndjson.gz` and `state/meta.json` (`{ lastSync: 'YYYY-MM-DD', minVotes, count, version: 2 }`).
- **Repo:** `iice257/ScrollFlix` is public, so pulling needs no auth. URL: `https://github.com/iice257/ScrollFlix/releases/download/catalog-latest/catalog.tar.gz`.
- **Code:** Biome style. No new runtime dependencies. Script tests run under Vitest; name them `scripts/catalog/*.test.mjs` and add `scripts/**` to the Vitest include if it is not already covered.

## Review Focus

- Pull fails while offline or because GitHub is down, but a catalogue is already on disk: the build warns and continues. With no catalogue at all, it fails clearly. Test: `pull.test.mjs › offline keeps existing`.
- A film is removed from TMDB, or its poster is deleted, between runs: it drops out instead of shipping a broken path. Test: `state.test.mjs › removed and posterless films drop`.
- Titles and overviews with emoji, RTL text or quotes survive the round trip through encoding. Test: `rows.test.mjs › unicode round trip`.
- A returning visitor has saved favourites under old local ids: they still show after the upgrade. Test: `catalog-loader.test.ts › migrates legacy saved ids`.
- A discover year with more than 10,000 results (TMDB's 500-page cap): the seed splits it by month, so no film is lost. Test: `seed.test.mjs › splits capped years by month`.

---

### Task 1: TMDB client and row codec

**Files:**
- Create: `scripts/catalog/tmdb-client.mjs`
- Create: `scripts/catalog/rows.mjs`
- Tests: `scripts/catalog/tmdb-client.test.mjs` and `scripts/catalog/rows.test.mjs`
- Modify: `vitest.config.ts` include, if needed

**Interfaces:**
- Produces: `createTmdbClient({ token, rps = 40, fetchImpl = fetch, sleep })`, returning:
  - `discover(params)`: GET `/3/discover/movie`, returns `{ page, total_pages, total_results, results }`
  - `movie(id)`: GET `/3/movie/{id}?append_to_response=external_ids`, returns the JSON or `null` on 404
  - `changes(startDate, endDate, page)`: GET `/3/movie/changes`
  - `stats()`: returns `{ requests, failures }`
- Produces: `normaliseFilm(details) => Film | null`, where
  `Film = { id, title, year, rating10, genres: string[], country: string, posterPath, backdropPath, voteCount, popularity10, runtime, overview, tagline, imdbId, avgColour? }`.
  It returns null when there is no poster or no year.
- Produces: `encodeChunks(films: Film[], { rowsPerChunk = 2000, textRowsPerChunk = 500 }) => { manifest, files: Map<name, string> }`.
  - The manifest is `{ version: 2, count, chunks: string[], texts: string[], chunkSize, textChunkSize, genres: string[], countries: string[], generatedAt }`.
- Produces: `decodeRow(row, manifest)`, the inverse, used in tests and by the app.

- [ ] **Step 1: Write failing tests.**
  - `rate limit`: 100 calls at `rps: 40` with a fake clock take at least 2.4 s of fake time.
  - `retries 429 honouring Retry-After`.
  - `404 → null`.
  - `5 failures → throws and counts`.
  - `rows`:
    - `round trip`: encode, then decode, gives the input.
    - `unicode round trip`: emoji, Arabic and `"` all survive.
    - `hashed names`: the same input gives the same names and a changed row changes only its chunk's name.
    - `empty backdrop → ''`.
- [ ] **Step 2: Run** `npx vitest run scripts/catalog`. Expected: FAIL.
- [ ] **Step 3: Implement** both modules.
  - The hash is the first 8 hex characters of SHA-1 over the file content (`node:crypto`).
  - Genre and country tables are sorted by frequency, descending.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** with "Catalogue v2: TMDB client and row codec".

### Task 2: Seed, nightly merge and state

**Files:**
- Create: `scripts/catalog/seed.mjs`, `scripts/catalog/state.mjs`, `scripts/catalog/avg-colour.mjs`
- Create: `scripts/catalog/build.mjs`, the CLI
- Tests: `scripts/catalog/seed.test.mjs`, `scripts/catalog/state.test.mjs`, plus fixtures in `scripts/catalog/fixtures/`

**Interfaces:**
- Consumes: Task 1.
- Produces: `chooseMinVotes(client, target) => number`.
  - Probes `discover({ 'vote_count.gte': n })` and reads `total_results`.
  - It binary-searches over n in 1..200 and returns the smallest n whose total is ≤ `target × 1.05`.
- Produces: `discoverIds(client, minVotes) => Set<number>`.
  - Calls `discover` per `primary_release_year` from 1874 to the current year plus 1, with `include_adult=false`, `include_video=false` and `sort_by=vote_count.desc`.
  - Any year with more than 500 pages is split by month using `primary_release_date.gte` and `primary_release_date.lte`.
- Produces: `readState(dir) => Map<number, Film>`, `writeState(dir, films, meta)`, and `mergeChanges(prev, changedFilms: Map<number, Film | null>, minVotes) => Map<number, Film>`.
  - In `changedFilms`, `null` means removed or no longer qualifying.
- Produces: `averageColour(posterPath) => Promise<string>`.
  - Fetches `w92`, resizes it to 1×1 with `sharp` (`kernel: 'cubic'`) and returns 6-hex.
  - It is cached by `posterPath` in state, so a nightly run only refetches new or changed posters.
- CLI: `node scripts/catalog/build.mjs --mode seed|nightly|bootstrap --target 100000 --state <dir> --out <dir>`
  - `seed`: run `chooseMinVotes`, then `discoverIds`, then `movie()` for each id, then `normaliseFilm`, then `averageColour`, then write state and output.
  - `nightly`: read state, then collect `changes` from `meta.lastSync` to today (paged), plus `discoverIds` limited to the current and previous year for new films. Refetch only those ids, merge, encode and write.
  - `bootstrap`: no network. Convert today's `public/json/0-4.json` plus `public/json/catalog/` (v1) into v2 state and output.
    - Use `backdrop_path` where the local data has it, and `''` otherwise.
    - Fill `imdbId`, `runtime` and `tagline` from local data where they exist.
  - Every mode ends by printing `{ count, minVotes, requests, failures }`.
  - It exits with code 1 when the failure rate is over 2%, or when the count is below 95% of the previous count (nightly only).

- [ ] **Step 1: Write failing tests,** using a fake client fed from fixtures:
  - `chooseMinVotes picks smallest n under target·1.05`
  - `splits capped years by month`: a fake year with 600 pages produces 12 month queries
  - `removed and posterless films drop`
  - `merge keeps avgColour when posterPath unchanged`
  - `nightly window starts at meta.lastSync`
  - `bootstrap converts v1 local + catalogue rows to 10,000 v2 films with ids unchanged`: run against the real files in the repo
- [ ] **Step 2: Run** `npx vitest run scripts/catalog`. Expected: FAIL.
- [ ] **Step 3: Implement.** Package scripts:
  - `"catalog:build": "node scripts/catalog/build.mjs"`
  - `"catalog:pull": "node scripts/catalog/pull.mjs"` (Task 3)
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Run** `npm run catalog:build -- --mode bootstrap --state .catalog/state --out .catalog/out`. Expected: count 10000. Add `.catalog/` to `.gitignore`.
- [ ] **Step 6: Commit** with "Catalogue v2: seed, nightly merge, bootstrap from current data".
- [ ] **Step 7: Live seed check.** Only if `TMDB_API_READ_TOKEN` is set in the environment:
  - Run `--mode seed --target 2000`. Expected: about 2,000 films, failures under 2%, and printed `minVotes`.
  - If the token is not set, skip this step and say so in the report.

### Task 3: Pull, publish and the nightly workflow

**Files:**
- Create: `scripts/catalog/pull.mjs` and `scripts/catalog/pull.test.mjs`
- Create: `scripts/catalog/package.mjs`, which writes `catalog.tar.gz` from `--state` and `--out`
- Create: `.github/workflows/catalog.yml`
- Modify: `package.json`, setting `"build": "npm run catalog:pull && tsc -b && vite build"`
- Modify: `.github/workflows/ci.yml`: drop `lfs: true` and its comment, and run `npm run catalog:pull` before e2e
- Modify: `vercel.json` headers:
  - `/json/catalog/manifest.json` gets `public, max-age=0, must-revalidate`
  - other `/json/catalog/*` files get `public, max-age=31536000, immutable`
- Modify: `.gitignore`, adding `public/json/catalog/`

**Interfaces:**
- `pull.mjs [--with-state <dir>] [--dest public/json/catalog]`:
  - downloads the release URL to a temp file
  - extracts `catalog/` into the destination, replacing it atomically (extract to a sibling folder, then rename)
  - with `--with-state`, also extracts `state/`
  - Offline rule: if the download fails and `<dest>/manifest.json` exists, warn and exit 0. Otherwise exit 1 with a clear message.
  - It also exits 0 without network when `CATALOG_SKIP_PULL=1` is set.
- `catalog.yml`:
  - `on: schedule: cron '0 3 * * *'`, plus `workflow_dispatch` with input `mode` (`nightly`, `seed` or `bootstrap`; default `nightly`)
  - `permissions: contents: write`, and `concurrency: catalog`
  - Mode resolution: when the state is missing, or it is day 1 of the month, the mode becomes `seed`
  - Steps:
    1. checkout and node from `.nvmrc`
    2. `npm ci`
    3. `npm run catalog:pull -- --with-state .catalog/state --dest .catalog/out`, with `continue-on-error` for the first run
    4. build with `TMDB_API_READ_TOKEN: ${{ secrets.TMDB_API_READ_TOKEN }}`
    5. package
    6. `gh release create catalog-latest --title "Catalogue" --notes "Nightly film catalogue" || true`, then `gh release upload catalog-latest catalog.tar.gz --clobber`
    7. if `secrets.VERCEL_DEPLOY_HOOK_URL != ''`, run `curl -fsS -X POST "$HOOK"`
  - Timeout 300 minutes.

- [ ] **Step 1: Write failing tests** with an injectable download function:
  - `pull.test.mjs › extracts catalog into dest`
  - `offline keeps existing`
  - `offline with nothing fails`
  - `with-state extracts state`
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** `pull.mjs`, `package.mjs`, the workflow, and the package, CI, Vercel and gitignore changes.
- [ ] **Step 4: Run** `npx vitest run scripts/catalog`. Expected: PASS.
- [ ] **Step 5: Validate** the workflow YAML with `npx --yes @action-validator/cli .github/workflows/catalog.yml`, or with `actionlint` if available.
- [ ] **Step 6: Commit** with "Nightly catalogue workflow; build pulls the latest catalogue". Do not create the release yourself. The orchestrator publishes the bootstrap release after review.

### Task 4: App loads catalogue v2 as the only source

**Files:**
- Create: `app/cmps/views/test-gallery/catalog-loader.ts` and `catalog-loader.test.ts`
- Modify: `test-gallery.tsx`. Delete the local-tier and v1 loading code:
  - `loadMovieDataset`, `DATASET_FILE_COUNT`, `availability.json`, the `public/media/single` fallback and `resolveMoviePosterUrls`
  - `mapCatalogRow`, `loadCatalogManifest`, `loadAllMovies`
  - the text-chunk loader (lines about 1240-1534)
  Import these from `catalog-loader.ts` instead.
- Modify: `saved-store.ts` and `session-path.ts`, so stored ids pass through `migrateLegacyId` on read
- Modify: `landing.ts`, if it reads local-only fields
- Modify: `playwright-tests/*.spec.ts`, which must no longer expect local poster files
- Delete:
  - `public/json/0.json` to `4.json`
  - `public/json/catalog/` (now gitignored and pulled)
  - `public/media/posters/`, `public/media/single/`
  - `scripts/build-catalog.mjs`, `scripts/generate-poster-thumbnails.mjs`
  - the LFS line in `.gitattributes`, and the `media:posters` script
  Keep `public/media/poster-sprite.*` and `scripts/generate-poster-sprite.mjs`. Workstream I owns those.

**Interfaces:**
- Produces:
  ```ts
  export type CatalogManifestV2 = { version: 2; count: number; chunks: string[]; texts: string[]; chunkSize: number; textChunkSize: number; genres: string[]; countries: string[]; generatedAt: string }
  export const loadFirstChunk: () => Promise<TestMovie[]>     // manifest + chunk 0, enough for the globe (top 2,000)
  export const loadAllMovies: (opts: { lightweight: boolean; full: boolean }) => Promise<TestMovie[]>
  export const loadMovieText: (movie: TestMovie) => Promise<{ overview: string; tagline: string; imdbId: string }>
  export const migrateLegacyId: (id: string) => string        // /^\d+-(\d+)$/ → `c$1`, anything else unchanged
  ```
- `TestMovie` gains `posterPath: string` and `backdropPath: string | null`. It keeps `posterUrl` (`w154`), `posterDetailUrl` (`w342`), `posterListUrl` (`w92`) and `placeholderColor` exactly as today. Workstream I changes the sizes later.
- Loading rule:
  - The globe opens on chunk 0.
  - On desktop, the remaining chunks load 400 ms after the globe is ready, as today.
  - On lightweight devices, chunks load up to 20,000 films, and the rest load when the index, search or filters first open.
  - With Save-Data, nothing loads past chunk 0 until the index, search or filters open.
- The globe window and landing logic must still pick from the top-ranked films, so the default globe looks like today's.

- [ ] **Step 1: Write failing tests:**
  - `catalog-loader.test.ts › decodes v2 rows into TestMovie`: id `c27205`, `posterPath`, `backdropPath`, runtime
  - `migrates legacy saved ids`: `'0-27205' → 'c27205'` and `'c11' → 'c11'`
  - `lightweight loads ≤ 20k then rest on full:true`
  - `saved-store.test.ts › legacy ids read back migrated`
- [ ] **Step 2: Run** `npm run test:unit`. Expected: FAIL.
- [ ] **Step 3: Implement** the loader and the migration, rewire `test-gallery.tsx`, and delete the files listed above.
  - Use the bootstrap output (copy `.catalog/out/catalog` into `public/json/catalog/`) as the local catalogue while you develop.
- [ ] **Step 4: Run** `npm run check && npm run test:unit && CATALOG_SKIP_PULL=1 npm run build`. Expected: green.
- [ ] **Step 5: Run** `npm run test:e2e` against the dev server, with the bootstrap catalogue in `public/json/catalog/`. Expected: green.
- [ ] **Step 6: Browser check** with `preview_start` on the dev server:
  - the globe opens
  - the index shows 10,000 films (bootstrap)
  - search finds a catalogue-only film
  - a saved film from an old-format id still shows
- [ ] **Step 7: Commit** with "Load catalogue v2 as the only film source; retire the local poster tier".
