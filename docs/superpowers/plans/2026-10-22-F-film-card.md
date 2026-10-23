# Plan F: catalogue fields, English titles, trailers

Spec: `docs/superpowers/specs/2026-10-22-social-round-design.md`. Branch: `feat/film-card-trailers` from `origin/main`.

## 1. Catalogue (`scripts/catalog/`)

- `tmdb-client.mjs`: `append_to_response: 'external_ids,videos'`.
- `rows.mjs`, `normaliseFilm`, add:
  - `originalTitle`: `details.original_title`, kept only when it differs from `title` (case- and accent-insensitive).
  - `originalLanguage`: `details.original_language`.
  - `trailers`: up to 3 keys from `rankTrailers(details.videos?.results)`, a new pure function.
- `rankTrailers`:
  - Accept YouTube only. Prefer `type === 'Trailer'` over `'Teaser'`, `official`, `iso_639_1 === 'en'`, and then the newest `published_at`.
  - Drop everything that isn't a Trailer or Teaser, and remove duplicate keys.
- Text chunks become `[overview, tagline, imdbId, originalTitle, originalLanguage, trailerKeys]`. Keep `trailerKeys` as one string with keys separated by spaces, to stay compact.
- Bump the manifest or text format version so the app knows. Old chunks with three fields must still decode.
- Tests in the existing `*.test.mjs` cover: ranking (official English trailer first, teasers last, non-YouTube dropped), `original_title` equal or different, and the round trip of the new text fields.
- The state file format may need the new fields too. Check `state.mjs` and `pool.mjs`, and make sure a nightly run on an old state doesn't crash. The orchestrator will run a seed afterwards.

## 2. App data (`catalog-loader.ts`)

- `TestMovie` gains `originalTitle?: string`, `originalLanguage?: string` and `trailerKeys?: string[]`, filled when the text chunk loads (the same place as overview and tagline).
- Add tests for old and new chunk shapes.

## 3. English titles (`title-translation.ts`, `use-title-translation.ts`, details card)

- When `originalTitle` exists, the card shows `title` (English) as the heading and a quiet secondary line, "Original title · <originalTitle>". This needs no API and works on mobile.
- On-device translation is offered only when there's no `originalTitle`, the title looks non-English (the current detection), and the APIs exist.
- Move the work into the click handler: the first `Translator.create()` must run inside the user's gesture.
  - Use the `monitor` option for the download progress, and show a small spinner or progress state.
  - On failure, show an inline line, "Couldn't translate this title here", which fades out.
- The preference toggle stays, so later titles translate automatically once a language pack is ready.
- Fix whatever stopped the button from rendering.
- Unit-test the hook with mocked APIs: the gesture path, the failure path, and the hidden-when-unsupported case.

## 4. Trailers (`app/cmps/views/test-gallery/trailer/`, new)

- **`trailer-logic.ts`**, pure:
  - `nextKey(keys, failed)`.
  - The dead-key store in `localStorage` (`wtw:dead-trailers:v1`, capped at 500 entries, wrapped in try/catch).
  - `youtubeSearchUrl(title, year)`.
- **`trailer-sheet.tsx`**:
  - **Loading:** the IFrame API script (`https://www.youtube.com/iframe_api`) loads lazily the first time it's opened, behind a shared promise. Use the `youtube-nocookie.com` host with `playsinline=1`, `rel=0` and `modestbranding=1`.
  - **Errors:** an `onError` (2, 5, 100, 101, 150), or no `onReady` within 10 s, marks the key dead and tries the next one.
  - **All keys failed:** a calm message, "This trailer can't play here", plus **Watch on YouTube** (the search URL).
  - **Layout:** a full-height sheet on phones with a drag handle and close, and a centred 16:9 player with a dimmed backdrop on desktop.
  - **While open:** Escape closes it, focus is trapped and then returned to the button, and app sounds are muted through the shared sound settings and restored on close.
- **Details card button "Play trailer":**
  - Shown when `trailerKeys` has a key that isn't dead.
  - When every key is dead, it becomes "Watch trailer on YouTube" and opens the search directly.
  - Hidden when there are no keys at all.
- Load `frontend-skill` first. Match the card's existing buttons, spacing and type exactly. The player must feel like part of the app, not a pasted iframe.
- **Off-limits:** `app/cmps/views/test-gallery/party/**`. A parallel builder owns it. In `test-gallery.tsx`, only touch the details card and its imports.

## Done when

- `npm run check`, `npm run build` and `npm run test:unit -- --run` are green.
- `node scripts/catalog/...` tests pass. Run a tiny real pull locally if `TMDB_API_READ_TOKEN` is available; otherwise rely on the fixtures.
- Browser check at 375×812 and on desktop, with a local catalogue that has the new fields. For example, patch a fixture chunk or build a small catalogue from fixtures. Check:
  - a film with an original title
  - the trailer playing
  - a forced failure (a bad key) falling through to the next key and then to the YouTube fallback
  - translate on desktop Chrome
- Report screenshots of each.
