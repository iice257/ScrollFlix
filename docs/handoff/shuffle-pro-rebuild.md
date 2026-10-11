# Execution prompt: repair the Codex pass, rebuild Shuffle Pro, add Saved movies

You are a fresh session with no prior context, and this document is self-contained. Every product decision has already been made with the owner. Do not re-interview the owner or reopen these decisions. Ask the owner only if the code contradicts this document in a way that blocks you. When that happens, batch your questions, propose a default for each, and keep working on everything else.

Before anything else, read `AGENTS.md` and `CLAUDE.md` at the repo root. They require the `frontend-skill` for every frontend task, and `taste-skill` for the visual polish of the effects. They also set a production-grade quality bar: no "developer-looking" output.

---

## 0. Context you need

- **Repo:** `C:/Users/0/Documents/Projects/Github/What-to-watch`, branch `main`. The app is ScrollFlix, a WebGL globe of movie posters.
  - Stack: React 19, Vite, TypeScript, Tailwind, Biome and Vitest.
  - The globe lives in `app/cmps/views/test-gallery/infinite-movie-menu.tsx`.
  - The page shell lives in `app/cmps/views/test-gallery/test-gallery.tsx`.
  - Styles live in `app/styles.css`. `app/light-theme.css` is generated from `styles.css` by `npm run theme:light` (`scripts/generate-light-theme.mjs`). Never hand-edit it.
- **Baseline:** `f9fc352` is the last commit before a weaker agent ("Luna", running in Codex) worked on the repo. Its commits are `ac37f6a`, `8065cd2`, `86f3d18` and `64044e2`, and they were pushed straight to `main`. Luna also left uncommitted changes in the main checkout. An audit found the following:
  - Luna's Shuffle Pro is off-spec and buggy. It is being **deleted and rebuilt** (Phase 2 and Phase 3).
  - The globe "feel" regressed in four ways. These are fixed in Phase 1.
  - CI on `main` is red because of a Biome format error at `test-gallery.tsx:1722`.
  - Some work the transcripts called "done" never landed: the preloader waiting for all posters, and a random landing movie.
- **Do not touch:**
  - the `catalog-20k` branch, or its worktree at `C:/Users/0/Documents/Projects/Github/What-to-watch-refine`. Another agent owns both.
  - `docs/brand-rejected/` or `docs/handoff-next-session.md`.
  - the "Where the data comes from" copy, or any copy not named here.
- **Merge friction:** `catalog-20k` will later merge with your work, and it also edits `infinite-movie-menu.tsx` and `test-gallery.tsx`. Put new logic in **new files** wherever this document names one, and keep edits to those two large files surgical.

## 1. Workflow (mandatory)

1. **Create the branch and worktree.** Run `git worktree add ../What-to-watch-pro -b rebuild/shuffle-pro main`, then work only in `C:/Users/0/Documents/Projects/Github/What-to-watch-pro`. Give it a `node_modules` junction to the main repo's `node_modules`, for example `cmd /c mklink /J node_modules ..\What-to-watch\node_modules`.
2. **Carry over two uncommitted changes from the main checkout.** Copy them by hand, and don't modify the main checkout:
   - In `app/styles.css`, `.warp-details-watch` gets `width: fit-content; max-width: 100%; flex: 0 0 auto;`. Remove `.warp-details-watch` from the mobile `width: 100%` group, and keep `.warp-details-next` in it.
   - In `scripts/generate-light-theme.mjs`, the stage block gets a `.warp-details-tip` rule: `border-color: rgb(255 255 255 / 0.14); background: rgb(28 28 28 / 0.98); color: #fff; box-shadow: 0 8px 24px rgb(0 0 0 / 0.4);`. Then run `npm run theme:light`.
   - Do **not** carry the uncommitted tooltip change. The tooltip is rebuilt in Phase 1.
3. **Dev server.** Add a configuration named `pro` to the main repo's `.claude/launch.json`: `npx vite --port 3070 --strictPort`, with `cwd` set to the new worktree and `port` 3070. Start it with preview_start `{name: "pro"}`. Use the in-app browser for localhost only.
4. **Gates, which must be green before every commit:** `npm run check`, `npx vitest run`, `npx tsc -p tsconfig.app.json --noEmit` and `npm run build`.
5. **Commits.** Make one commit per phase, or several if a phase is large, with clear messages. Push the branch and open a PR to `main`. **Do not merge and do not deploy.** The owner signs off first.
6. **Delegation.**
   - Phase 1 and Phase 4 items may go to Sonnet subagents, under three conditions: each gets a self-contained spec, no two agents own the same file at the same time, and you review every diff.
   - Do Phase 2 and Phase 3 (Shuffle Pro, its shaders and the choreography) **yourself**. That work failed when delegated last time.
7. **Verification.**
   - Check every visible change at 1440×900, 1280×720 and 390×844, in both dark and light themes. The theme toggle is in the About drawer.
   - Take screenshots as proof.
   - Reset the viewport to desktop when you finish.
   - If the browser pane is hidden the globe stops rendering; calling preview_start again brings it back.

---

## Phase 1: repair the regressions and finish the open items

Each item gives the current state, the target and how to check it.

### 1.1 CI and repo hygiene
- Fix the Biome format error. `npm run check` must be clean.
- Delete `.codex-preview.config.ts`.

### 1.2 Release inertia (`ArcballControl` in `infinite-movie-menu.tsx`)
- **Current behaviour:**
  - The decay is `1 - exp(-dt / releaseDecayMs)`, with `releaseDecayMs` ranging from 150ms to 390ms by pointer speed.
  - It applies equally to drags, wheel and arrow keys.
  - The velocity value goes stale: it only updates on moves, so "flick, hold still, release" still coasts.
- **Target:** keep the decay frame-rate independent, but start from the baseline's time constant, `τ0 = -16.667 / ln(0.9) ≈ 158.2 ms`. This equals the baseline's `0.1 × timeScale` at 60fps.
  - **Pointer drag and swipe:** `τ = τ0 × (1 + 0.5 × clamp(v / 1.4, 0, 1))`, so at most 1.5× baseline.
  - **Wheel and arrow keys (the nudge path):** `τ = τ0 × (1 + 0.2 × clamp(v / 1.4, 0, 1))`, so at most 1.2× baseline. Pass the source into `endDrag` (`'pointer' | 'nudge'`).
  - **Fresh velocity only:** if more than 80ms passed between the last move and release, `v = 0`.
- **Tests:** put the τ calculation in an exported pure function, `releaseTimeConstant({ speedPxMs, source, msSinceLastMove })`, and unit test it, including the stale case.
- **Check:** compare against a baseline build. In a second worktree at `f9fc352` on another port, a slow drag must feel the same as baseline. A hard flick should coast noticeably longer, but never more than 1.5×.

### 1.3 Canvas inline styles and idle per-frame work
- Remove the inline `style={{ ... filter, transition, touchAction, userSelect, ... }}` from the `<canvas>`. Move `user-select: none`, `-webkit-user-select: none` and `-webkit-touch-callout: none` into the `.warp-infinite-menu-canvas` rule in `styles.css`.
- Restore the baseline `.is-hold-primed` feedback: the brightness and saturate filter, the 1.018 scale, and the 260ms transitions.
- Remove the `onRotationVelocity` engine callback and the per-frame `--shuffle-pro-blur` writes.
- **Rule:** nothing runs per frame while the globe is idle, beyond what baseline already does.
- **Mobile zoom.** Replace the CSS `scale(1.085)` on the canvas with a camera change. Below 901px wide, divide `cameraRestZ` by 1.085.
  - Pass this as a `zoom` prop, or fold it into `scale`, and re-run it on resize.
  - Delete the `--warp-wall-zoom` CSS.
  - On mobile, the hold-primed scale must work again.

### 1.4 Directional motion blur (keep it; rebuild it in the shader)
- Delete the CSS `filter: blur()` approach completely.
- In the poster vertex shader, work out each vertex's screen-space motion: `cross(rotationAxis, worldPos) × angularSpeed`, projected to clip space, then converted to a UV-space direction. Pass it to the fragment shader as a varying.
- In the fragment shader:
  - When `uMotionBlur > 0` (a uniform branch), take 6 taps along that direction, clamped to the poster's atlas tile so neighbouring posters don't bleed in.
  - Set `uMotionBlur = smoothstep(threshold, cap, |angularSpeed|)`. Starting values: threshold 2.2 rad/s, cap 6.5 rad/s, maximum smear 1.2% of the poster's height.
  - Tune by eye: blur should never show during an ordinary gentle drag, should read clearly as speed on a hard flick, and should be strongest during Shuffle Pro.
  - The uniform is 0 while idle, which costs nothing.
- Keep the existing velocity-distortion term in the shader.

### 1.5 Home keyboard tooltip (`.warp-spin-hint`): rebuild on the baseline markup
- **Target look:** the baseline at `f9fc352`. A dark pill, 12px/700 text, `padding: 5px 5px 5px 8px`, 8px gaps, an X button at the end, about 32px tall.
- **Target content:** one line, desktop only. Every item is a flex child aligned on centre:
  `[↑][↓][←][→] scroll · [space] shuffle · [esc] back · [enter] open`
  - The arrow keycaps use lucide `ArrowUp`, `ArrowDown`, `ArrowLeft` and `ArrowRight` icons at 11px with stroke 2.6.
  - All keycaps use the baseline `kbd` sizing: `height: 20px; min-width: 20px; border-radius: 6px; font-size: 11px; font-weight: 800`. Word keycaps (`space`, `esc`, `enter`) are lowercase, with `padding-inline: 6px`.
  - The `·` separators are rendered at 0.4 opacity.
- **Hide it at ≤900px** with a media query in `styles.css`, not a Tailwind class. Remove all the `inline-grid align-middle` utility classes.
- Put the sentence in the `aria-label`.
- **Check:** at 1280 and 1440 it sits on one line, centred, with no overflow, in both themes. It still shows only until the first spin.

### 1.6 Space inside the details card
- Space still re-shuffles while a details card is open, which the owner asked for. It no longer does so when focus is on a button, link or input inside the card; then the focused control activates natively.
- The Re-shuffle button itself works either way.
- Update `shouldHandleGalleryKey` and its tests.

### 1.7 About drawer scrim; details backdrop
- **About scrim.** While the compact About drawer is open, add a `.warp-drawer-scrim` behind it:
  - `position: fixed; inset: 0; z-index: 119`
  - `background: rgb(0 0 0 / 0.32)` with `backdrop-filter: blur(10px)`
  - It fades in over 220ms and fades out with the drawer's presence.
  - Clicking it closes the drawer.
  - The light theme gets its colour from the generator. Check that it doesn't wash out.
- The maximized About page doesn't need the scrim.
- The Saved drawer (Phase 4) reuses this scrim.
- Return `.warp-details-backdrop` blur to the baseline 7px.
- Revert the light-theme navy backdrop rule from `86f3d18`, in both the generator stage and the generated output.

### 1.8 Copy constant
- Replace the five hard-coded `20k+` strings with one `CATALOGUE_LABEL = '20k+'` constant. Leave the wording around them unchanged.

### 1.9 Desktop details card height
- Luna hard-coded `min(616px, 58vw, …)`, but the spec is to measure the card with "Paperman" selected.
- **To measure:**
  1. Temporarily remove the fixed `height` at 1440×900.
  2. Open Paperman.
  3. Record the card's rendered height `H` and width `W` (the width should be 1040).
- **Target:** `--details-max-height: min(Hpx, calc((100vw - 64px) * H / 1040), calc(100dvh - 64px))`, with `height: var(--details-max-height)`. Long overviews scroll inside the copy column; that already works.
- Report `H` to the owner.

### 1.10 Preloader waits for every globe poster
- **Current:** `INITIAL_READY_POSTER_COUNT = 72`.
- **Target:** the preloader completes when every poster on the globe has **settled**.
  - A poster has settled once it loads, or once it fails after 2 retries with backoff of 800ms and then 2400ms. A failed poster settles with the existing fallback.
  - Progress shows settled ÷ total.
  - Add a safety net: if the posters haven't all settled within 25s, reveal the globe anyway.
  - "Skip first time load" still reveals the globe at once while loading continues.
- **Check:** throttle to Fast 4G and confirm the progress bar and the Skip button behave.

### 1.11 Random landing movie
- On every page load, the first centred and active movie is a **random** movie from the globe's visible set.
  - Never "Marmaduke": find its id in `public/json`, and exclude it by id.
  - The globe must **start already facing** that movie: add an engine method `faceItem(id)` that sets the orientation before the first frame, with no animation.
- Leave favourites-based landing for later; it isn't wanted yet.

### 1.12 Delete Luna's Shuffle Pro completely
Remove all of the following:
- **In `infinite-movie-menu.tsx`:**
  - the `PressState` shuffle fields and `startShufflePro`
  - the props `onShuffleProPhase`, `onShuffleProRelease`, `onNonShuffleInteraction`, `onSpinGestureEnd` and `isShuffleProMax`, and the `spinRequest.shuffleProAutomatic*` fields
  - the `SHUFFLE_PRO_*` and `GLOBE_BLUR_*` constants, and `stopNudge` if nothing else uses it
  - the 64044e2 touch click-guard. **Keep this one**, but move it into a small named function.
- **In `test-gallery.tsx`:**
  - the `shuffleStreakRef`, `proComboStreakRef` and `quickSpinStreakRef` refs, plus `resetShuffleStreak`
  - the document-level `resetStreakForOtherActions` listeners
  - the streak resets inside the keydown handler
  - `premiumSuggestion`, `shuffleProPresentation`, the `warp-shuffle-pro-announcement` output, `proMaxActive`, the premium badge, `data-premium-variant`, and the `handleShuffle` options
- **In CSS and the generator:**
  - the whole "Shuffle Pro" block at the end of `styles.css`
  - the Shuffle Pro rules in the generator's stage block
  - **Keep:** the light-mode 1px control borders block, the dark-theme selector guard, and the whitespace normalisation.
- **Keep for Phase 3:** the fullscreen button and hint. Phase 3 reworks them.

Commit Phase 1.

---

## Phase 2: Shuffle Pro core, with the Frost path end to end

Shuffle Pro is the app's easter egg, and the owner wants it **jaw-dropping**: cinematic, sensational and polished, on every path. "Restrained" and "subtle" were wrong last time. The owner explicitly encourages creativity on top of the floor described here. Performance is the only hard limit.

### 2.1 Architecture (new files under `app/cmps/views/test-gallery/shuffle-pro/`)
- **`shuffle-pro-logic.ts`:** pure, framework-free functions, fully unit-tested in `shuffle-pro-logic.test.ts`. Inject `random` and `now`; never call `Math.random` or `performance.now` inside them. It holds:
  - `shouldTriggerHold({ elapsedMs, maxMovedPx, immersive })`. Not immersive: still (`maxMovedPx ≤ 8`) for 5000ms, or moving for 10000ms. Immersive: still for 3000ms, or moving for 6000ms.
  - `isBigSpin(totalRotationRad)`: true at π/2 or more.
  - `reduceStreak(state, event, { immersive, random })` returns `{ state, trigger: Tier | null }`. Section 3.1 gives the rules.
  - `resolveTier(base, { found, random })` applies the Gold rule (section 3.4).
  - `angularSpeedAt(tMs, profile)`, `cameraPullback(speed, profile, cameraRatio)` and `revealAt(tMs, profile)`, following the timeline in 2.3.
- **`shuffle-pro-store.ts`:** versioned `localStorage` under the key `wtw:shuffle-pro:v1`. Wrap every read and write in try/catch.
  - Shape: `{ found: { frost?, amethyst?, jade?, gold? }, totalRuns }`. Each `found` entry is `{ count, firstAt, lastAt }`.
  - Found paths **persist** across refreshes, because a future stats page will read them. Streak counters do **not** persist; they live in refs and reset on refresh.
- **`shuffle-pro-controller.ts`:** the state machine. Its phases are `idle → armed (hold timer running) → windup → peak → landing → presented → idle`, plus `aborting`.
  - It is the single owner of timers and the requestAnimationFrame loop.
  - Engine calls go through a narrow interface: `startAutoSpin`, `setAutoSpin`, `landOn`, `setSkyState` and `faceItem`.
  - All cleanup happens in one place.
  - It exposes a subscribe/snapshot for React (`useSyncExternalStore`) with `{ phase, tier, theme, isSpinning, canSkip }`.
- **`sky-pass.ts`:** the WebGL sky program, drawn in the globe's existing GL context. See 2.4.
- **`shuffle-pro-audio.ts`:** the whoosh. See 2.8.
- **`shuffle-pro.css`:** all Shuffle Pro DOM styling: the premium frame, the skip button and the shelf. Import it from `app/main.tsx` after `light-theme.css`. The light-theme generator doesn't read it, so write explicit `[data-theme="light"]` rules wherever the colours differ.
- **`infinite-movie-menu.tsx`** only gains engine capabilities: auto-spin with angular velocity and axis, camera pull-back, `landOn`, `faceItem`, sky-pass hooks and the blur uniform. It also forwards press and hold information to the controller. No Shuffle Pro UI logic goes in this file.

### 2.2 Triggers for this phase
- **Hold.** Press and hold the globe, using `shouldTriggerHold`.
  - The existing 220ms hold-to-drag keeps working: the globe follows your finger until the trigger fires, and from then on Shuffle Pro owns the motion.
  - A press that triggers Shuffle Pro never opens a poster on release.
- **5 big spins in a row** start an automatic Frost run (section 3.1).
- **Touch:** `contextmenu` is `preventDefault`-ed only while a touch or pen press is active on the canvas. A desktop right-click still reaches the native menu.

### 2.3 Choreography (Frost, Amethyst and Gold share it; Jade uses its own profile in 3.3)
Use these as starting values. You may tune each within ±25% for feel, and must report the final values. The aim: **something new happens every second or so**, so the run never feels like constant acceleration.

| t | Event |
|---|---|
| **0, trigger** | **The catch:** the camera springs in 4% then back over 300ms, and a light ring pulses out from the press point (sky pass, 600ms). Android vibrates for 12ms. |
| 0 to 4s | **Wind-up:** `ω(t) = 0.6 + (7.0 − 0.6) × (t / 4000)^2.2` rad/s, so the acceleration itself builds. The spin axis starts from the user's last drag direction (or `(1, 0.35)` normalised if they held still) and precesses up to 25° over a 6s period, so the globe wobbles like a gyroscope. |
| 0 onward | **The globe shrinks as speed rises:** the camera pulls back by `1.4 × cameraRatio × (ω / ωmax)^1.3`, with about 250ms of damping. This is a real 3D pull-back, never a CSS scale, and it is **continuous through the peak**. |
| 0.8s | **The sky opens** (`skyReveal` 0→1 over 2.2s, smoothstep). See 2.4. |
| 1.5s | **The path's colour washes in** (0→1 over 2s). Motion blur builds with speed (1.4). |
| 3.0s | **Path particles arrive** (0→1 over 1.5s). See 2.5 and Phase 3. |
| **5.0s, peak** | **Shockwave ring** (700ms) plus one soft exposure lift: +15% over 250ms, then back. Never strobe: one flash per run. The tier fully blooms, and the **rim light starts breathing** on a 1.2s period. That breathing is the "you can let go" cue; there is no on-screen text. A visually hidden live region says "Release to reveal your pick". Android vibrates `[20, 40, 20]`. The spin carries on at `ωmax` with ±4% drift for as long as the user holds. |
| **Release after the peak** | **Landing:** pick a random visible movie, never the current one. ω decays with τ = 450ms, the camera glides back in over 1.2s, and `landOn` hands over to the existing snap and spin-to-item behaviour once ω is below 1.2 rad/s. It ends with a slight overshoot and settle. The poster lifts as usual, and the card opens **in the premium frame** (2.6). The sky holds at 60% behind the card backdrop and fades out over 600ms **when the card closes**. Android vibrates for 15ms. |
| Release before the peak | Same momentum landing, but the sky and colour fade out over 400ms and the card opens normally. This counts as a normal shuffle. |
| Esc during a run | **Abort:** decelerate to rest, fade the sky over 400ms, open no card. This breaks the streak. |

**Reduced motion** (`prefers-reduced-motion`; also add a `?reduced-motion` debug override):
- no spin and no pull-back
- a gentle camera "breath" (±2% Z, 3s period)
- the sky and path effects fade in **static**: no streaks, no drift, no twinkle
- particles become a few static glints
- no flash
- the premium frame stays, but static

### 2.4 Sky pass: dark mode is a galaxy, light mode is heavenly clouds
- **Rendering.**
  - A fullscreen-triangle shader, drawn **before** the globe each frame while `skyIntensity > 0`.
  - It renders into an offscreen framebuffer at **0.5× the canvas resolution**, which is then upsampled bilinearly.
  - **Zero work while idle:** create the framebuffer and program lazily on the first run, and skip the pass completely at intensity 0.
  - The canvas clears to alpha 0 today, so the sky composites over the page background.
- **Dark theme: a galaxy.**
  - Three parallax star layers, procedural by hash. Stars twinkle at low speed.
  - As ω rises, the stars **stretch into streaks** along the screen-space spin direction, with streak length proportional to ω, for a hyperspace feel.
  - A domain-warped nebula (fbm, at most 4 octaves) tinted with the path's palette, plus faint dust lanes.
  - The brightest structure keeps out of the globe's central disk, so the posters stay readable. The only exception is the rim light, a glow just outside the globe's silhouette. Compute the screen radius from camera Z and sphere radius, and pass it as a uniform.
- **Light theme: heavenly clouds.**
  - Layered soft clouds (fbm with a billowy remap) drift past at a speed that scales with ω.
  - Warm volumetric god rays fan out from **behind** the globe.
  - The palette is a pale sky blending into the path's tint: icy and silvery for Frost, lavender dawn for Amethyst, teal mist for Jade, golden hour for Gold.
  - It is bright and airy, never grey.
- **The sky pass also draws:** the trigger ring, the peak shockwave, the rim light, and the Gold filigree (3.4).
- **Adaptive quality.**
  - During the first 45 frames of a run, measure the average frame time.
  - If it is above 20ms, step down to sky resolution 0.35×, 2 fbm octaves and half the particles. Report the chosen level in the debug panel.
  - **Target:** p95 frame time of 20ms or less at 1440×900 on desktop, during the peak.

### 2.5 Frost signature (blue and ice)
- **Palette:** `#E8FBFF`, `#BFE9FF`, `#7CC8FF`; deep `#06223A`.
- **Frost creep:** a crystalline Voronoi or dendrite frost pattern grows inward from the screen edges, at most 22% of the short side, with glinting specular highlights.
- **Particles:** ice shards, which are faceted diamond sprites in a fragment shader, catching the light as they tumble in orbit around the globe.
- **Rim light:** cold blue-white.
- **Card frame (2.6):** iridescent frosted-glass border.

### 2.6 The premium frame on the details card
- **Border:** a 2px animated conic-gradient border in the path's palette. Use `@property --sp-angle`, with one revolution every 6s.
- **Glow:** an outer glow in the path's colour.
- **Foil sheen:** one sweep across the whole card on open, over 900ms.
- **Edge particles:** a small 2D canvas behind the card draws up to 60 path particles drifting along the card edges for 2.5s, then stops and unmounts.
- **Eyebrow:**
  - Text: `✦ Shuffle Pro · Frost`, and likewise `· Amethyst` and `· Gold`. Jade reads `✦ Shuffle Pro Max · Jade`.
  - Style: 11px, weight 800, `letter-spacing: 0.08em`, uppercase, in the path's colour.
  - Placement: in flow, at the top of the copy column above the meta line, on both desktop and mobile. **Never** absolutely positioned. It must never collide with the close X or the mobile Re-shuffle button.
- **Reduced motion:** a static gradient border, no sheen and no particles.
- **Removal:** the frame goes away when the card closes or the user re-shuffles from it.

### 2.7 Skip
- **When a spin is active, the dock's Shuffle button becomes "Skip".** A spin is active during a normal shuffle spin, any automatic run, and every Shuffle Pro phase up to the card opening.
  - The dice icon and the "Shuffle" label crossfade to the lucide `ChevronsRight` icon and the label "Skip" (`aria-label="Skip to the movie"`), and the pill's width animates smoothly.
  - It changes back when the card opens or the run aborts.
- **Space during an active spin means Skip,** not a new shuffle. Skip doesn't count toward the streak.
- **Tapping the globe during an automatic run also means Skip.** This fixes Luna's stuck state.
- **What Skip does:**
  - It cancels the choreography and settles to the target within 300ms (ease-out).
  - It opens the card: premium if the tier was already decided (an automatic run, or a hold past the peak), normal if the hold hadn't reached the peak.
  - The sky follows its usual fade rules.
- **In immersive mode** there's no dock, so the corner circle covers this (3.3).

### 2.8 Whoosh (the only sound in this phase)
- **Source:** procedural Web Audio, with no files and no network.
  - White-noise buffer → band-pass filter, whose frequency follows ω (200Hz to 2.4kHz), with gain proportional to ω.
  - A quiet low sine "rumble" at 40–60Hz, proportional to ω.
  - It fades out over the landing.
- **The `AudioContext`:**
  - Create it lazily, and resume it inside the **first globe pointerdown**. Safari needs a real user gesture for that, and runs fire seconds later from timers.
  - Before that first pointerdown, and when sound is off, it does nothing.
- **Toggle:** an "Easter egg sound" switch in the About drawer, **on by default**, persisted as `wtw:sound:egg`. Style it like the existing theme switch.
- Everything else to do with sound is the **next phase**, in 6.2.

### 2.9 Debug panel: `?shuffle-pro-debug`
Gate it the same way as the existing `?gesture-debug`. It provides:
- buttons to start a run of each tier immediately: Frost, Amethyst, Jade, Gold
- force release, force peak, and toggle reduced motion
- live readouts of ω, phase, frame time (average and p95), adaptive quality level, and the sky-pass draw count (which must stay frozen while idle)
- a "reset found paths" button

You need this panel to verify the work, because the browser tool can't hold a press for 5s reliably.

Commit Phase 2.

---

## Phase 3: the other paths, immersive mode and Gold

### 3.1 Streak rules (implemented in `reduceStreak`; keep counters in memory only)
- **Shuffle actions** each add 1 to `streak`:
  - the dock Shuffle button
  - Space when it shuffles
  - the card's Re-shuffle, by button or Space
  - a **big spin**: a drag or swipe whose total rotation reaches π/2 from press to rest, including inertia. The engine accumulates the rotation and reports it once the motion settles.
  - releasing a Shuffle Pro hold, before or after the peak
- **Breaking events** set both `streak` and `bigSpinRun` to 0:
  - opening a poster by tap, click, Enter or Let's Watch
  - changing any filter, sort or search
  - switching views
  - opening the Watch links, About or Saved
  - Esc aborting a run
- **Neutral events** (no effect):
  - closing a card that a shuffle opened, by X, backdrop, Esc or swipe
  - wheel and arrow nudges
  - drags of less than π/2
  - saving a movie
  - Skip
- **`bigSpinRun`** counts big spins in a row. Any other shuffle action resets it to 0, and so does any breaking event.
- **Automatic triggers.** These are checked after each action is counted, and the run starts on that action's shuffle:
  - **Not immersive:**
    - `bigSpinRun` reaches 5 → a **Frost** run.
    - `streak` is 10 or more → roll `random() < 0.05` on **every** shuffle action until it fires or the streak breaks → an **Amethyst** run.
  - **Immersive:**
    - `bigSpinRun` reaches 3 → a **Jade** run.
    - `streak` reaches 6 → a **Jade** run, guaranteed.
  - After **any** Shuffle Pro run ends, both counters reset to 0.
- **Hold triggers:** a hold gives **Frost** when not immersive, and **Jade** when immersive.
- **Unit tests** must cover all of the above, including:
  - mixed action types
  - neutral events not breaking the streak
  - the 5% roll firing at exactly the 10th action when `random` returns 0.01
  - the roll never firing before the 10th action
  - immersive and normal thresholds

### 3.2 Amethyst signature (purple glitter, the rare path)
- **Palette:** `#F1E4FF`, `#C9A7FF`, `#9B6BFF`, plus `#FFC8F0` for sparkle highlights; deep `#1D0F33`.
- **Particles:** dense, swirling **glitter**: four-point sparkle sprites that twinkle and flash as they catch the light, swept into a slow vortex around the globe.
- **Petals:** a few soft petals drift down slowly in the foreground, at most 8.
- **Sky:** in dark mode, an amethyst nebula. In light mode, lavender dawn clouds with sparkles.

### 3.3 Jade signature, Pro Max, and immersive mode
- **Jade's look:**
  - Palette `#B8FFF0`, `#5FE3C5`, `#1FA88C`; smoke `#0E3B35`.
  - **Smoke wisps**: domain-warped fbm smoke, masked to a band around the globe's silhouette and advected along the spin direction, so it trails behind the spin and curls like ink in water.
  - A smouldering teal edge on the card frame.
- **Jade's profile** is "shorter and more exciting":
  - Hold trigger at 3s.
  - `ωmax = 9 rad/s`, with the wind-up exponent applied over **2.0s**.
  - The peak lands **2.5s** after the trigger.
  - Every other timeline step is scaled by 0.5.
- **Immersive mode** unlocks Pro Max. It now exists on every device; until now it was mobile-only:
  - **Button placement:** on desktop, a circular icon button in the top bar, immediately left of the "Let's Watch" button, matching its height. On mobile, keep the existing top-right placement.
  - **Behaviour:** where `document.fullscreenEnabled` is true, call `requestFullscreen` on the shell. On iPhone, where element fullscreen doesn't exist, fall back to in-app immersive. Either way, set `data-immersive="true"` on the shell.
  - **While immersive:**
    - Fade out the top bar, the dock, the title card, the active peek, the keyboard tooltip, and the i and Saved buttons (240ms).
    - Show a small "Exit" pill at the top right (lucide `Minimize2`, 36px, safe-area aware).
    - Show a **corner circle** at the bottom right: 52px, safe-area aware, using the dock pill's tokens. At rest it shows the dice icon and shuffles. During an active spin it **pops** with a 220ms scale-in spring to `ChevronsRight` and skips.
  - **Exiting** happens via the Exit pill, Esc (when no card or run is active), or leaving browser fullscreen. Any of these restores the UI.
- **Install as an app:** add `public/manifest.webmanifest` with `display: "fullscreen"`, plus `apple-mobile-web-app-capable` and `apple-mobile-web-app-status-bar-style: black-translucent` meta tags. Link the manifest in `index.html`. Use the existing `favicon.svg` as the icon, since the logo is still pending. Adding ScrollFlix to the home screen on iPhone then gives true edge-to-edge.
- **The one-time hint** "Go full screen for maximum immersion":
  - shows for 5s after the first **globe** interaction (pointerdown on the canvas, a wheel event over the wall, an arrow key, or Space), on every device
  - is never triggered by dock clicks
  - is remembered with the existing `wtw:fullscreen-hint-seen` key
  - is anchored to the immersive button
- **Check on Android** (Chrome DevTools device mode is fine for layout): real fullscreen works. On iPhone, the fallback has to be reasoned about from code; say so in the report.

### 3.4 Gold, and the path to it
- **Unlocking Gold:**
  - Once Frost, Amethyst and Jade are **all** in the persisted `found` record, the **next** Shuffle Pro run of any kind is upgraded to **Gold**.
  - After Gold has been found, every Shuffle Pro run has a 10% chance of the Gold upgrade.
  - This logic belongs in `resolveTier`, with tests.
- **Gold's look:**
  - Palette `#FFF3D1`, `#F7D58B`, `#E0A93B`, filigree `#F2C46D`; deep `#2A1A05`.
  - **Art-deco filigree:** concentric rings around the globe with deco ticks, sunburst rays and corner ornaments, drawn as SDFs in the sky pass. They **draw themselves** along their arc length during the wind-up.
  - Gold dust particles.
  - A warm sunburst behind the globe.
- **Gold's frame:** foil with ornate linings, using corner flourishes drawn as inline SVG in the frame. The sheen sweep runs twice.
- **Sky:** in dark mode, a golden nebula with deco rays. In light mode, golden-hour clouds.

### 3.5 Collection shelf (About drawer)
- **Placement:** in the compact About drawer, below the controls list, a section titled "Easter egg" with four gem slots in one row.
- **Undiscovered slots:** a dim outlined silhouette and a "?". **Never spoil the names.**
- **Discovered slots:** the gem in its path's colours with a gentle shimmer, the path name, and `×count`.
- **The Gold slot:** shows a faint lock until the first three are found, then a "?" until Gold itself is found.
- The same shelf also appears in the maximized About page, under "See if you can find the easter egg."
- It reads from `shuffle-pro-store`.

Commit Phase 3.

---

## Phase 4: Saved movies and the share card

### 4.1 Saved movies (favourites)
- **Store:** `saved-store.ts`, using `localStorage` under the key `wtw:saved:v1`. It holds an array of `{ id, savedAt }`, newest first. Unknown ids, for example after a catalogue change, are skipped silently. The future stats page will read this too.
- **On the details card:**
  - A circular heart button directly right of "Where to watch", the same height (44px; 38px on mobile).
  - Lucide `Heart`, filled when saved, with `aria-pressed`. The `aria-label` is "Save movie" or "Remove from saved".
  - It plays a small 200ms pop when you save.
- **Entry point:**
  - A circular heart button stacked directly above the i button, with the same size, style and right edge, and a 10px gap. It shows a count badge when the list isn't empty.
  - Below 360px it moves with the i button.
  - At 390×844, if it collides with the centred dock, move it into the top bar left of the immersive button instead, and note that in the report.
- **The Saved drawer:**
  - It rises from the heart button exactly like the compact About drawer (same component styling and motion) and reuses the scrim from 1.7.
  - Each row shows a poster thumbnail, the title, and year · rating. Clicking a row opens the details card. Each row has a remove ×.
  - Empty state copy: "Nothing saved yet. Tap ♥ on any movie card to keep it here."
  - Esc closes it. Add it to the Esc layering order straight after About. It counts as an overlay for `shouldHandleGalleryKey`.
- Saving is neutral for streaks (3.1).

### 4.2 Share card for premium picks
- **Button:** on cards in the premium frame only, a "Share" icon button (lucide `Share2`) next to the heart.
- **The image:** compose a 1080×1350 PNG with Canvas 2D. Draw:
  - a static render of the path's sky (a gradient plus a scatter of stars or glitter that suits the path)
  - the poster, centred, inside the path's frame
  - the title, year and `✦ Shuffle Pro · <Path>`
  - the "ScrollFlix" wordmark in DM Sans 950 with `-0.05em` tracking
  - **No URL.**
- **CORS:** load the poster with `crossOrigin = 'anonymous'`. If the canvas still ends up tainted, render the frame with a placeholder in the path's colours instead.
- **Delivery:** use `navigator.share({ files })` when `navigator.canShare` accepts files. Otherwise download `scrollflix-<title-slug>-<path>.png`.

Commit Phase 4.

---

## Phase 5: finish

### 5.1 Full verification pass
Run all of these at 1440×900, 1280×720 and 390×844, in both themes:
- globe drag, flick, wheel and held arrows, compared with a baseline build
- hold feedback, on desktop and mobile
- the tooltip
- every Shuffle Pro path, via holds where possible and the debug panel otherwise
- release before and after the peak, Skip (dock, Space, the corner circle, a globe tap during an automatic run), and Esc abort
- reduced motion
- immersive mode, entering and exiting
- the shelf
- Saved, adding, removing and opening
- the share card
- the About scrim
- the card height
- the preloader under throttling
- the random landing
- Escape layering
- regressions in the Filters page, Index sorts, card tag filters and Index Space-shuffle

### 5.2 Performance
- Record the frame-time numbers from the debug panel for each path at the peak.
- Confirm the sky-pass draw count stays frozen while idle.

### 5.3 Report to the owner
- What shipped.
- Final tuning values.
- The measured Paperman height `H`.
- Anything you couldn't verify, in particular the iPhone fallback, real-device haptics, and real-device performance.
- A screenshot set: each path at its peak in both themes, and each premium card.

---

## 6. Explicitly out of scope

### 6.1 Leave for later
- the stats page (the stores in this document are its data source)
- favourites-based landing positions
- the logo work
- the context-menu and camera-controls handoffs in `docs/handoff/`

### 6.2 Sound is the next phase
Append a section to `docs/handoff/sound.md`, titled "Sequencing", that says three things:
- Sound is the **next phase after this rebuild**.
- `shuffle-pro/shuffle-pro-audio.ts` already provides the Shuffle Pro whoosh. It has its own "Easter egg sound" toggle, which is on by default.
- The full sound layer must fold that whoosh into its master volume and categories, keeping the owner-approved whoosh default. It should also add the Shuffle Pro peak chime (tuned per path: glassy for Frost, bell for Amethyst, breathy for Jade, a rich chord for Gold) and the landing thud.

Don't build any other sound now.
