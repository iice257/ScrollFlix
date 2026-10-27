# Visual baselines

Pixel checks (`toHaveScreenshot`) for the globe and the screens around it. The
older specs check URLs, `currentSrc` and `naturalWidth`, so a poster that was
cropped, overlapping or blurry still passed. These fail it.

Run: `npm run test:visual` (config: `playwright.visual.config.ts`, project
`visual`, Google Chrome only, one worker, against a production build served by
`vite preview`).

## What is covered

Desktop 1440x900 and phone 390x844, light and dark (4 variants), each with:
globe at rest after full load, globe mid-spin (frame-locked), opened film card,
index rows, About, loader (normal), history panel, share card. The amber
"slow" loader is a `test.fixme` until workstream D lands `data-loader-state="slow"`.

PNGs live in `__screenshots__/`, named `<state>-<device>-<scheme>.png`.

## Determinism (no app hooks)

Everything is test-side, in `support.ts`: seeded `Math.random`, fixed `Date`
and timezone, theme and "seen" flags in storage, a mocked catalogue and
mocked TMDB posters (`../fixtures/`: 120 films, 25 loud numbered posters with
borders and coloured corners, poster 25 is square), DM Sans served locally,
all other network refused. The mid-spin test freezes the page clock
(`window.__SF_TEST__.freeze()/step()`), scripts the drag and steps an exact
number of frames. "Globe complete" means `data-webgl-state="ready"`,
`data-texture-progress="100"`, loader `data-state="ready"`.

Regenerate fixtures only if their design changes: `node playwright-tests/fixtures/generate.mjs`.

## Platform rule

Baselines are generated on the CI platform (ubuntu, Chrome, software WebGL)
only. Do not commit PNGs made on Windows or macOS: fonts and anti-aliasing
differ and CI will fail. Local runs are for looking, not for committing.

## Changing a baseline (the PR workflow)

1. Make the UI change. CI's visual step fails and uploads `visual-diffs`
   (expected / actual / diff images).
2. Run the **Update visual baselines** workflow on your branch (Actions tab, or
   `gh workflow run update-visual-baselines.yml --ref <branch>`). It
   regenerates every PNG on ubuntu, commits them to your branch and uploads them
   as an artifact.
3. In the PR description attach before and after images of every changed
   baseline (take "before" from main's PNGs, "after" from the new commit).
4. King approves baseline changes. A PR with changed PNGs and no approval
   does not merge. Unexpected diffs elsewhere are regressions, not baselines to
   update.

## Tolerance

`maxDiffPixelRatio: 0.002` (about 2,600 px at 1440x900) and per-pixel
`threshold: 0.15`. Software WebGL is deterministic on one platform, so this only
absorbs anti-aliasing. A cropped or shifted poster changes far more than that.

## Selector / hook contract

Keep these stable, or change them together with this spec:
`canvas[aria-label="Infinite movie poster menu"]` with `data-webgl-state`,
`data-texture-progress`, `data-item-count`; `.warp-gallery-preloader[data-state]`;
`[data-gallery-ready]`; `.warp-shell[data-theme]` driven by localStorage
`wtw:theme`; localStorage `wtw:session-path-lines` and
`wtw:session-path:v1`; the loader's `data-loader-state="slow"`; button labels
"Movie index", "About ScrollFlix", "Open details for ...", "History and
favourites"; storage keys `wtw:spin-hint-seen`, `wtw:fullscreen-hint-seen`,
`wtw:mood-nudge-seen`; catalogue under `/json/catalog/` (manifest + chunk
format); posters from `image.tmdb.org/t/p/wNN/<path>.jpg`.
