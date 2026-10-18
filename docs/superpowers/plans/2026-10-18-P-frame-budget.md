# P: Frame-time budget, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure the globe's frame time, then remove the regressions so spinning with every feature on holds 60 fps and an idle globe does no per-frame work.

**Architecture:**
1. A dev-only probe and a Playwright benchmark produce a before/after table.
2. The saved-film constellations and the session path move from a full-screen Canvas2D overlay (`constellation-layer.tsx`) into the WebGL engine (`infinite-movie-menu.tsx`). They are drawn as line strips plus glow sprites in the same frame as the posters.
3. Per-frame layout reads and allocations are removed.

**Tech Stack:** React 19, TypeScript, raw WebGL2, Vitest (jsdom), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-18-quality-performance-design.md` (Workstream P).

## Global Constraints

- **Budget:** spinning with every feature on, p95 frame time ≤ 16.7 ms on the dev laptop. No feature may add more than 1 ms at p95 compared with all features off.
- **Idle:** with the globe idle and no animation in progress, there is no `requestAnimationFrame` work at all. The twinkle may tick at most 15 fps while idle, and never under `prefers-reduced-motion`.
- **Look:** the constellations and path keep their current colours (`PATH_INK`, tiers), the "you are here" ring and the draw-in animation (`DRAW_IN_MS = 900`). The before/after screenshots must look the same apart from cheaper glow.
- **Code style:** Biome (`npm run check`), single quotes, 2-space indentation, no semicolons. Match the comment density of the surrounding code.
- **No new runtime dependencies.**
- **Files:** keep edits to `test-gallery.tsx` to wiring only.

## Review Focus

- Saved set and path change while spinning: geometry rebuilds once per change, not per frame. Test: `constellation-geometry.test.ts › rebuilds only when inputs change`.
- A film that appears twice on the globe: links attach to its first instance, matching today's `getPosterWorld` rule. Test: `poster-index.test.ts › first instance wins`.
- Theme switch (light/dark) while constellations show: colours update without reload. This is an e2e step in Task 3.
- Reduced motion: no twinkle and no idle rAF. Test: `twinkle-clock.test.ts › reduced motion never schedules`.
- Window resize or scroll while the globe sits under other content: the cached canvas rect refreshes, so links stay on their posters. This is an e2e step in Task 4.

---

### Task 1: Frame-time probe and benchmark

**Files:**
- Create: `app/cmps/views/test-gallery/perf-probe.ts`
- Create: `app/cmps/views/test-gallery/perf-probe.test.ts`
- Create: `playwright-tests/perf.bench.ts`
- Create: `playwright.perf.config.ts`, which reuses the main config with `testMatch: '**/*.bench.ts'`, headed Chromium and real GPU (no `--disable-gpu`)
- Modify: `package.json`, adding `"perf": "playwright test -c playwright.perf.config.ts"`
- Modify: `infinite-movie-menu.tsx` `run()` (about line 1580), calling `perfProbe?.frame(deltaMs)` once per drawn frame
- Modify: `app/main.tsx`, which installs the probe only when `location.search` has `perf=1`

**Interfaces:**
- Produces: `export type FrameStats = { frames: number; p50: number; p95: number; p99: number; longTasks: number }`
- Produces: `export const createPerfProbe = () => ({ frame(ms: number): void, reset(): void, stats(): FrameStats })`
- Produces: `window.__scrollflixPerf` (set only under `?perf=1`) with the same three methods. The benchmark reads it.
- Feature toggles for the benchmark: under `?perf=1`, query flags `constellations=0|1`, `path=0|1`, `weather=0|1`, `pro=0|1` override the stored settings. The benchmark seeds about 12 saved films and a 10-stop session path through `localStorage`/`sessionStorage` (keys `wtw:saved:v1` and `wtw:session-path:v1`) before load.

- [ ] **Step 1: Write the failing test.** In `perf-probe.test.ts › percentiles`, feed 100 frames of 1..100 ms. Expect `p50 === 50`, `p95 === 95`, `p99 === 99` and `frames === 100`. Add `reset clears`.
- [ ] **Step 2: Run** `npx vitest run app/cmps/views/test-gallery/perf-probe.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement `createPerfProbe`.**
  - Use a ring buffer of the last 1,200 frame times and nearest-rank percentiles.
  - Count long tasks with a `PerformanceObserver({ type: 'longtask' })` when supported.
- [ ] **Step 4: Run the test.** Expected: PASS.
- [ ] **Step 5: Write `perf.bench.ts`.**
  - For each scenario (`all-off`, `constellations`, `path`, `constellations+path`, `all-on`, `idle-all-on`), load `/?perf=1&…`.
  - Wait for the globe to be ready (reuse the readiness wait from `playwright-tests/gallery-assets.spec.ts`).
  - Drag-spin the globe continuously for 6 s with `page.mouse`, at a steady 600 px/s, in a circle.
  - Read `stats()` and print one table row per scenario.
  - For `idle-all-on`, don't spin. Count rAF callbacks over 3 s by wrapping `requestAnimationFrame` through `page.addInitScript`.
  - Write the table to `test-results/perf.md`.
- [ ] **Step 6: Run** `npm run perf`. Expected: the table prints. Save it as **baseline** and paste it into the PR description later.
- [ ] **Step 7: Commit** with "Add a frame-time probe and spin benchmark".

### Task 2: Pure geometry for links and points

**Files:**
- Create: `app/cmps/views/test-gallery/constellation-geometry.ts`
- Create: `app/cmps/views/test-gallery/constellation-geometry.test.ts`

**Interfaces:**
- Consumes: `buildConstellation` from `constellation.ts`, plus `PathPoint` and `PATH_INK` from `session-path.ts`. Use them exactly as `constellation-layer.tsx` does today.
- Produces:
  ```ts
  export type LinkVertex = { a: number; b: number; t: number }   // instance indices of the two ends and the arc parameter 0..1
  export type GlowPoint = { index: number; size: number; rgb: [number, number, number]; kind: 'saved' | 'path' | 'here' }
  export type ConstellationGeometry = {
    links: Float32Array          // per vertex: aIndex, bIndex, t, tierId, drawInStart, along (0..1 along the whole path)
    linkCount: number
    points: Float32Array         // per point: index, size, r, g, b, kind
    pointCount: number
  }
  export const buildConstellationGeometry = (
    savedIds: readonly string[],
    path: readonly PathPoint[],
    indexOf: (id: string) => number | null,   // first instance index on the globe, or null
    light: boolean,
  ): ConstellationGeometry
  ```
- The arc itself is evaluated in the vertex shader: slerp between the two posters' sphere positions, read from the instance matrices, then lifted by `LIFT = 1.018`. The CPU only emits `ARC_STEPS + 1 = 27` vertices per link and never projects anything.

- [ ] **Step 1: Write failing tests.**
  - `emits 27 vertices per path link`: 3 path stops give 2 links, so `linkCount === 54`.
  - `skips films not on the globe`: when `indexOf` returns null, no link touches that film.
  - `rebuilds only when inputs change`: a memo wrapper `createGeometryCache()` returns the same object for equal `savedIds`, `path` and `light` (compared by reference plus length), and a new one after `path` grows.
  - `light theme uses light ink`: rgb equals `PATH_INK[tier].light` parsed.
- [ ] **Step 2: Run** `npx vitest run app/cmps/views/test-gallery/constellation-geometry.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `buildConstellationGeometry` and `createGeometryCache()`.
  - Port the link order, the saved-film "hearts" cap (`MAX_HEARTS = 24`), the path dedupe and the "here" point from `constellation-layer.tsx` lines 220-370.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** with "Constellation and path geometry as pure buffers".

### Task 3: Draw constellations and the path in the engine; delete the Canvas2D layer

**Files:**
- Modify: `app/cmps/views/test-gallery/infinite-movie-menu.tsx`
  - shader sources, the program setup near line 1517 and `render()` near line 2802
  - the `InfiniteMovieMenuControl` type at line 101
- Delete: `app/cmps/views/test-gallery/constellation-layer.tsx`
- Modify: `test-gallery.tsx`, swapping the `<ConstellationLayer …/>` element (about line 2838) for a `useEffect` that calls the new control method
- Test: `infinite-movie-menu.test.ts` (extend it), plus a new e2e test in `playwright-tests/user-flows.spec.ts`

**Interfaces:**
- Consumes: `buildConstellationGeometry` and `createGeometryCache` (Task 2).
- Produces, replacing `setOnFrame` for this use:
  ```ts
  setConstellations: (input: { savedIds: readonly string[]; path: readonly PathPoint[]; light: boolean; visible: boolean } | null) => void
  ```
- `getPosterWorld`, `getProjector` and `setOnFrame` stay if anything else uses them. Grep first, and delete what has no callers.
- Engine internals: add a second program, `overlayProgram`, with two draw calls after the posters:
  1. **Links:** `LINE_STRIP` segments via `gl.LINES`, from a vertex buffer of `ConstellationGeometry.links`. Line width is faked with a screen-space quad expansion, about 2 CSS px, alpha-blended.
  2. **Points:** instanced quads with a radial falloff in the fragment shader, `exp(-d²·k)`, additive blend. This replaces `shadowBlur` and `createRadialGradient`.
  - Instance positions come from a `positions` texture or uniform array filled from `instanceMatrices` once per frame. That is 900 vec3, which is cheap.
  - Uniforms: `uTime` (twinkle and glint), `uDrawIn` (0..1 since the last change, over 900 ms), `uLight`.
  - Back-face dimming uses the existing `facing` rule: alpha × clamp((z/r - 0.05)/0.95).

- [ ] **Step 1: Write the failing unit test** `infinite-movie-menu.test.ts › setConstellations marks render dirty once`, using the existing test harness or mocks in that file. Calling `setConstellations` twice with equal input dirties once.
- [ ] **Step 2: Run** `npx vitest run app/cmps/views/test-gallery/infinite-movie-menu.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the overlay program, the buffers, `setConstellations` and the render calls.
  - Only request frames while `uDrawIn < 1`, or while twinkling (Task 4 owns the clock).
- [ ] **Step 4: Wire `test-gallery.tsx`.** The same `active` condition as today drives `visible`. Delete `constellation-layer.tsx` and its import.
- [ ] **Step 5: Add e2e** `user-flows.spec.ts › constellations follow the globe and theme`.
  - Seed 3 saved films.
  - Check the WebGL canvas pixels near the first saved poster are brighter than a blank-sky sample, in both themes.
  - Toggle the theme and check the sample colour changes.
- [ ] **Step 6: Run** `npm run test:unit && npx playwright test playwright-tests/user-flows.spec.ts`. Expected: PASS.
- [ ] **Step 7: Screenshot** before (main) and after with 12 saved films plus a 10-stop path. Save both to `test-results/` for the PR.
- [ ] **Step 8: Commit** with "Draw constellations and the session path in the globe's own WebGL pass".

### Task 4: Twinkle clock, rect cache, lookups without allocation

**Files:**
- Create: `app/cmps/views/test-gallery/twinkle-clock.ts` and `twinkle-clock.test.ts`
- Create: `app/cmps/views/test-gallery/poster-index.ts` and `poster-index.test.ts`
- Modify: `infinite-movie-menu.tsx`
  - `getPosterRect` and `getPosterPoints` callers
  - `getProjector` (line 2144)
  - the `getBoundingClientRect` call sites
  - the render loop

**Interfaces:**
- Produces: `createTwinkleClock({ idleFps: 15, reducedMotion: boolean, onTick: () => void }) => { engineDrew(): void; setWanted(on: boolean): void; dispose(): void }`
  - While the engine is drawing, it never schedules its own rAF.
  - When the engine has been idle for over 100 ms and the clock is wanted, it ticks at `idleFps` or slower.
  - Under reduced motion it never schedules.
- Produces: `buildPosterIndex(items: readonly { id: string }[], instanceCount: number) => Map<string, number>`, mapping each id to its first instance index. The engine rebuilds it only when `items` change.
- Engine: `private canvasRect: DOMRect`, updated from a `ResizeObserver` plus window `scroll` and `resize` listeners (passive). Every per-frame path reads the cached rect.

- [ ] **Step 1: Write failing tests.**
  - `twinkle-clock.test.ts`, with fake timers and a mocked rAF:
    - `no rAF while engine draws`
    - `ticks ≤ 15/s when idle`
    - `reduced motion never schedules`
  - `poster-index.test.ts › first instance wins`: items `[a, b]` with 5 instances give `a → 0` and `b → 1`.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement** both modules, then use them in the engine.
  - Remove `getBoundingClientRect` from the per-frame code.
  - Remove the `getPosterWorld` per-frame walk, or delete it if it has no callers.
  - Hoist per-frame temporary arrays and matrices to reused fields.
- [ ] **Step 4: Run** `npm run test:unit`. Expected: PASS.
- [ ] **Step 5: Add e2e** `user-flows.spec.ts › links stay on posters after resize`. Resize the viewport, then repeat the pixel-brightness probe from Task 3.
- [ ] **Step 6: Commit** with "Idle twinkle clock, cached canvas rect, allocation-free poster lookup".

### Task 5: Audit the rest and hit the budget

**Files:** decided by the measurements. Candidates:
- `weather-layer.tsx`
- `poster-flight.tsx`
- React state set during spin in `test-gallery.tsx`: `onSpinActiveChange`/`setShuffleSpinning`, anything driven by `onFrame`, and stores that notify per frame
- the sky shader quality probe (`QUALITY_PROBE_FRAMES`, `QUALITY_STEP_DOWN_MS`)
- Shuffle Pro (`shuffle-pro/`)

- [ ] **Step 1: Run** `npm run perf`. Then record a 6 s Chrome performance trace of `all-on` spinning, with Playwright `page.context().tracing` or CDP `Tracing.start`. Open it as JSON and list the top 10 self-time functions.
- [ ] **Step 2:** For each item over 0.5 ms per frame, fix it at the source. Typical fixes:
  - stop React re-renders during spin (move per-frame values to refs, and add `memo` to children that take changing props)
  - skip overlay rAF while nothing is shown
  - avoid string building or style writes per frame
- [ ] **Step 3:** Each fix ships with a unit test where the logic is testable, for example `weather-logic`. Otherwise a benchmark row must improve.
- [ ] **Step 4: Run** `npm run perf`. Expected: `all-on` p95 ≤ 16.7 ms, every feature within 1 ms of `all-off`, and `idle-all-on` at 0 engine rAF and ≤ 15 twinkle ticks per second.
- [ ] **Step 5: Run** `npm run check && npm run test:unit && npm run build && npm run test:e2e`. Expected: all green.
- [ ] **Step 6: Commit** with "Spin within the 16.7 ms budget with every feature on". Put the before/after `perf.md` table in the commit body.
