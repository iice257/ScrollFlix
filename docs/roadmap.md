# What to Watch Roadmap

> **Status (2026-10-07):** the Voroforce engine and the old app shell were removed in [#5](https://github.com/iice257/ScrollFlix/pull/5) (merge commit `16b4d9d`). This document predates that change and is kept as a historical planning note. References to Voroforce, `app/vf` and the old app describe code that is no longer on `main`; see the git history before that commit.

This roadmap keeps the work split into two practical phases: first make the app fast, predictable, and easy to build; then add product features and polish.

## Phase 1: Foundation, Performance, And Lightweightness

Goal: make What to Watch reliable enough that future features do not pile onto a shaky baseline.

### Tooling And Project Hygiene

- Make the project npm-first so it works without Bun.
- Keep Node and package scripts consistent across local development, tests, and Playwright.
- Fix brittle tests and make the test suite useful on Windows and CI.
- Keep the README and metadata aligned with the What to Watch product name.

### Performance Baseline

- Add safe render defaults for Chromium-heavy environments.
- Cap effective render pixel ratio before users hit expensive full-screen shader paths.
- Fix media configuration fallbacks so missing environment values do not produce `NaN`.
- Avoid unnecessary per-frame GPU texture uploads where possible.
- Add lightweight performance flags and presets before doing deeper engine surgery.

### Rendering And Engine Cleanup

- Prefer low-risk changes in `app/vf` before changing `voroforce` internals.
- Measure the impact of media, post-processing, pixel ratio, and cell count separately.
- Keep the current custom WebGL engine unless profiling proves the architecture itself is the blocker.
- Identify Chromium/ANGLE-specific slow paths before considering a WebGPU, PixiJS, or other engine port.

### Phase 1 Exit Criteria

- `npm run build` passes.
- `npm run lint` and `npm run check` pass.
- `npm run test:unit -- --run` passes.
- E2E scripts run through npm.
- Default local startup does not rely on Bun.
- The app has a safer performance baseline for Windows/Chromium.

## Phase 2: Product Features And Polish

Goal: turn the stabilized app into a stronger personal movie discovery product.

### Discovery Features

- Add an advanced filter/classifier for movie discovery.
- Add "similar to this" and "movies like this" inside the film details UI.
- Support richer sorting and scoring based on genre, year, rating, popularity, and future metadata.
- Explore mood/vibe filters such as comfort watch, hidden gems, visually striking, slow burn, or high energy.

### Film Detail Experience

- Expand film detail behavior around `app/cmps/views/film`.
- Add stronger actions for saving, comparing, and following up on films.
- Improve custom link management and sharing.

### Persistent Product State

- Store user preferences and discovery state through `app/store/*-slice.ts` and `app/utils/settings.ts`.
- Keep user-facing preferences local-first unless a future backend is introduced.

### Data Layer

- Add data-driven movie features around `app/vf/utils/films.ts` and `public/json`.
- Consider generating search indexes or classifier metadata during a build/data-prep step.

### Polish

- Rename all user-facing surfaces to What to Watch.
- Tighten responsive behavior across desktop, iOS Safari, Android Chrome, and Windows Chromium.
- Improve onboarding, empty states, favorites, and settings.
