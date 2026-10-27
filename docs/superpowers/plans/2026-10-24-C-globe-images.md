# C: Globe images, plan and findings (fix/globe-images)

Status: investigation and standalone modules only. The engine, poster-flight,
decoded cache and sw.js are frozen until feat/sharp-followups lands.

## Benchmark: gnovotny/nothing-to-watch (read 25 Oct)
- Textures are `TEXTURE_2D_ARRAY` with one poster per layer, clamp-to-edge, plain
  LINEAR, 1 mip level, no gutters (so no neighbour bleed is possible), optionally
  KTX/ETC2/DXT1 compressed.
- Images are pre-built self-hosted tile grids in `public/media` at several
  resolutions. No per-poster TMDB fetches.
- No service worker, no LOD scheduler, no worker decode, no preroll.

What we take: simplicity. A pre-built atlas would cost Vercel bandwidth (see
C.10), so we keep TMDB, but every addition must be forced by a number or a
visible regression.

## C.1 root cause (evidence: NOTES/evidence/C/before-desktop-full.png, synthetic posters)
The quad is 0.68 x 1.0 (uv 0..1). Since 5ad584c the shader maps the poster into
uv x 0.117..0.883 and y 0.11..0.89 (`posterUv`), but the rounded-rect mask
(`roundedRectMask`, from 6929f20) still shows uv x 0.05..0.95 and y 0..1. The
margin (about 7% each side, 11% top and bottom) samples outside the poster
cell: the 2 px edge gutter, then the NEIGHBOUR cell of the atlas (cell pitch
68x100, the margin needs ~5.6 px x and 13 px y). Result: a smeared frame-like
border (white band in the screenshot) and bleed from adjacent posters; hidden
only once a mid-tier layer (clamp-to-edge array) fades in. Second defect:
`renderCell` stretches any non-2:3 source to the cell (squash, never letterbox).

Fix (when released): mask the poster rect exactly (x 0.117..0.883, y 0.11..0.89,
corner radius in poster space) and clamp base samples to the cell interior;
letterbox non-2:3 in renderCell. No atlas change needed.

## C.3 measurements (current, desktop 2160 posters / phone 1260)
- Desktop textureBytes 160,235,240 (152.8 MB: atlas 3876x3800 78.6, mid 320 x 154x231, detail 24 x 342x513). At budget.
- Phone 52,424,740 (50 MB of 80). Room for a sharper base on phone only.
- Decision: desktop base cell 64x96 -> 72x108 (atlas 4332x4256, 156.1 MB, mid pool 320 -> 233 by `fitTierConfig`);
  phone 48x72 -> 64x96 (68.1 MB of 80, mid 96 and detail 8 unchanged). 80x120 was rejected: it leaves 136 mid layers.
- perf before / after: see the PR body.

## Idle rAF (root cause)
Not the sky and not the twinkle. At rest the engine sleeps (0 rAF/s measured 60 s after load, twinkle ticks draw
straight from a timer). The 32-56 rAF/s in `idle-all-on` was poster arrivals: every upload wakes the loop for a few
drawn frames, and the bench started counting 2.5 s after `ready` while posters were still landing. The bench now
waits for `data-base-loaded == data-item-count` and `data-lod-pending == 0` first.

## Engine signals (canvas data attributes, for workstream D's loader)
- `data-globe-complete="true"`: set in `initTexture`, before any picture is requested. Every cell can draw (tier 1,
  its average colour, from the catalogue; no colour = the dark slot). Also fires a `globecomplete` event on the canvas.
- `data-base-loaded`: how many base cells show a picture (or the colour of a poster that failed). Equals
  `data-item-count` when tier 2 is in.
- `data-lod-pending`: mid / detail requests in flight (updated on each LOD pass).
- `data-webgl-state="ready"` keeps its old meaning (most pictures in).
A loader that must not wait on a bad connection can open on `data-globe-complete` instead.

## Tier 3 warm-up
When `baseCells >= items`, the tab is visible and the globe is at rest (< 0.05 rad/s), `planLod({ warm: true })`
gives mid layers to visible posters too small to need them yet, nearest the focus first, capped by the mid pool.
Requests keep the loader's priority and concurrency (12), so frame cost is the same as any mid load. Loaded layers
stay; leaving rest only cancels what has not landed.

## C.6
Superseded by staging's `shuffle-pool.ts` (#60): the pool of 3 loaded candidates covers the decoy idea, and
the card now opens on w342, which the pool preloads. The preroll module and its call-site were dropped in the merge.

## C.10 headers (vercel.json, for workstream A)
```json
{ "source": "/json/catalog/(.*)\\.([0-9a-f]{8})\\.json", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] },
{ "source": "/json/catalog/manifest.json", "headers": [{ "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }] },
{ "source": "/media/(.*)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=2592000, stale-while-revalidate=86400" }] },
{ "source": "/sw.js", "headers": [{ "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }] }
```
