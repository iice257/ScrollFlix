# Handoff: Sound (music and interaction sounds, opt-in)

You are a fresh session with no prior context. This document is self-contained. Do not assume anything not written here; where something is unknown it is stated as an assumption to confirm with the owner.

## Goal

Add an **opt-in, default-off** sound layer to ScrollFlix: background music plus distinct interaction sounds grouped by category. Sound must never autoplay, must respect browser autoplay rules, must cost nothing (no network, no decode, no main-thread work) while off, and must be controllable (master volume, per-category toggles) with preferences persisted in `localStorage`.

## How to start (mandatory)

1. Read `AGENTS.md` and `CLAUDE.md` at the repo root. The owner's CLAUDE.md requires two things for this task:
   - **Interview the owner before building.** Ask AI-led clarifying questions until the goal is unambiguous. Do not write code until the owner has answered. Open questions are listed in this document; ask them in small batches (3 to 5 at a time), propose a default for each, and record the agreed answers.
   - **Use the `frontend-skill` for any UI work** (skills live in `.claude/skills`; also consider `taste-skill` / `redesign-skill` for polish). Quality bar: production-grade, aligned, balanced, responsive on mobile and desktop, no "developer-looking" output. Preserve the existing design system, spacing and typography; reuse components.
2. **Re-read the current code first.** A refinement pass was running concurrently with this document being written. It is renaming Genres to Filters, adding Space = shuffle and Enter = open-details keyboard shortcuts, and adding a "Shuffle Pro" easter egg (press and hold on the globe for 5 seconds). Names, line numbers and behaviours quoted below were read from the code at commit `37e36dd` and may be stale. Treat every file/function reference here as "verify before relying on it", and say so to the owner if reality differs.

## Repo orientation (verified at 37e36dd)

- Stack: React 19, Vite, TypeScript, Tailwind + Radix UI, Zustand (see `AGENTS.md`). Lint/format with Biome (`npm run check`), unit tests with Vitest, e2e with Playwright.
- `app/cmps/views/test-gallery/infinite-movie-menu.tsx` (about 2400 lines): the WebGL globe of posters.
  - `ArcballControl` class: owns `orientation` (a quaternion that rotates the whole globe, the camera does not orbit), `pointerRotation`, inertia, snap-to-target (`snapTargetDirection`, `snapStrength`). Sets `canvas.style.touchAction = 'none'` in its constructor. Methods: `beginDrag`, `moveDrag`, `endDrag`, `cancelDrag`, `shiftDrag`, `update`.
  - `InfiniteMovieEngine<T>` class: `run`/`pause`/`resume`/`dispose`, `beginPointerDrag`/`movePointerDrag`/`endPointerDrag`/`cancelPointerDrag`, `nudge(dx, dy)` (wheel and arrow keys drive a short virtual drag so they share inertia and snapping), `setDetailFocus`, `spinToItem`, `cancelSpin`, `isSpinning`, `capturePickSnapshot(region)` + `pickFromSnapshot(snapshot, clientX, clientY)` (at press, projects every front-facing poster with the shader's matrices and keeps those touching a central hit ellipse; on release resolves deterministically: poster under the point, else nearest poster inside the ellipse, else null; geometry lives in exported pure helpers `ellipseIntersectsQuad`, `pointToQuadDistance`, `pickWinner`), plus the frame loop `animate`/`render` (skips drawing when "still"; keyed on orientation, rotation velocity, detail progress, `cameraPosition[2]`, and a `renderDirty` flag). The perspective camera sits on +Z (`cameraPosition`, `cameraRestZ`) and eases `cameraPosition[2]`.
  - Gesture constants near the top: `HOLD_TO_DRAG_MS = 220`, `CLICK_MOVE_TOLERANCE_PX = 8`, `HIT_REGION_CENTER_Y`/`HIT_REGION_RX`/`HIT_REGION_RY`, `NUDGE_RELEASE_MS`, `WHEEL_NUDGE_SCALE`, `WHEEL_NUDGE_MAX_PX`, `KEY_NUDGE_PX`, `KEY_HOLD_PX_PER_MS`, `ARROW_DIRECTIONS`, and the dev-only `?gesture-debug` overlay (`GestureDebugPanel`, `GESTURE_DEBUG`).
  - `InfiniteMovieMenu` React component (exported): holds `engineRef`, `pressRef` (`PressState`), and the handlers `handlePointerDown`/`handlePointerMove`/`handlePointerUp`/`handlePointerCancel` on the `<canvas className='warp-infinite-menu-canvas'>`, `handleWheel` on the wrapping `div.warp-infinite-menu`, a window-level `keydown`/`keyup` effect for arrow-key spin (guarded by `isActive`, `isDetailsOpen`, `isTypingTarget`), `openHit`, and a `spinRequest` effect. Props include `onActiveItemChange`, `onOpenItem`, `onUserSpin`, `onMovingChange`, `onLoadProgress`, `onReady`, `isActive`, `isDetailsOpen`, `spinRequest`.
  - Today `handlePointerDown` returns early for `event.pointerType === 'mouse' && event.button !== 0`, so right and middle buttons are ignored by the globe.
- `app/cmps/views/test-gallery/test-gallery.tsx` (about 2900 lines): the page shell.
  - `TestGalleryApp`: state for `mode` (`'wall' | 'list' | 'genres'`; Genres is being renamed Filters), `sortRules`/`sortOpen`, `filterOpen`, `selectedGenres`, `aboutOpen`, `detailsMovieId`, `watchMovieId`, `spinRequest`, `theme` (localStorage `THEME_STORAGE_KEY`), `spinHintSeen` (localStorage `SPIN_HINT_STORAGE_KEY`). Handlers: `handleShuffle` (random movie then `setSpinRequest`), `handleOpenMovie`, `handleOpenWatchLinks`, `clearAllFilters`, `toggleGenre`. A window `keydown` effect handles Escape, closing the top-most layer (watch links, then details, then About, then Sort, then Filters).
  - `WarpWall` wraps `InfiniteMovieMenu` (in a `section.warp-wall`, `inert` when not the active mode).
  - `WarpChrome`: top bar (`warp-topbar`: brand/reset button, manifesto, clock, "Let's Watch" CTA), `warp-active-peek` live region (active title and meta), and the dock (`warp-dock`): `dockTop`, then a row with the Gallery/Index toggle (`warp-mode-toggle`), `dockLead`, `warp-main-nav` (Watch in gallery mode; Genres/Back in index mode, showing a filter count), and `dockActions` (in gallery mode: Shuffle `warp-shuffle-button`, then `warp-filter-actions` with an optional Clear button `warp-filter-clear` and the Filters pill `warp-filter-button`; in index mode: Sort, Shuffle, Filters). A bottom-right `warp-info-button` (i) opens About.
  - Panels and overlays: `SortPanel`, `FilterPanel`, `GenresView`, `AboutDrawer`, `WatchLinksDialog`, `MovieDetailsCard`, `WarpList`.
- `app/styles.css`: all styling (Tailwind layers plus hand-written `warp-*` classes). `app/light-theme.css` is GENERATED from `styles.css` by `npm run theme:light` (`scripts/generate-light-theme.mjs`). Never hand-edit `light-theme.css`; edit `styles.css` and regenerate, and verify both themes.
- `app/cmps/ui/`: Radix wrappers (`dropdown-menu.tsx`, `tooltip.tsx`, `dialog.tsx`, `drawer.tsx`, `switch.tsx`, `radio-group.tsx`, `select.tsx`, `scroll-area.tsx`, and others). Radix packages installed: accordion, dialog, dropdown-menu, label, radio-group, scroll-area, select, slot, switch, tooltip. There is NO context-menu wrapper and `@radix-ui/react-context-menu` is not installed (verify in `package.json`).

## Current behaviour

There is no audio anywhere in the app today (assumption: grep for `Audio`, `AudioContext`, `<audio` to confirm before starting). Existing persistence precedent: theme (`THEME_STORAGE_KEY`) and the spin hint (`SPIN_HINT_STORAGE_KEY`) are read and written in `test-gallery.tsx` inside try/catch around `window.localStorage`. Follow that pattern exactly.

Interaction surfaces that will want sounds (verify each against current code):
- Globe: drag/spin (inertia ticks as posters pass the centre, via the engine's nearest-poster change callback `onActiveItemChange`), catch-a-spinning-globe press, click-to-open a poster, hold-to-drag arming, wheel and arrow nudges.
- Shuffle: dock button (`handleShuffle`, `spinRequest`) and the spin-to-poster arrival that opens the details card. A "Shuffle Pro" long-press easter egg may also exist.
- Details card (`MovieDetailsCard`) open and close; Watch links dialog (`WatchLinksDialog`) open and close; About drawer open and close.
- Mode switch: Gallery/Index toggle in `WarpChrome`; Index and Filters views.
- Containers of child actions ("stacks/folders"): the Filters pill and its panel (`FilterPanel`, genre chips, content-type filters), the Sort panel (`SortPanel`, multi-rule sort with direction toggles), and any grouped menu added later (for example a right-click menu).
- Confirmations and state changes: toggling a genre chip, setting sort direction, Clear filters, Reset (brand button), theme toggle.
- Errors and empties: WebGL fallback (`webglError`), empty filter results, movie data load failure (`loadState === 'error'`).

## Requirements

### Categories (propose, then confirm with the owner)
Each category has its own on/off toggle and a small family of short sounds (variants so repeated actions do not feel robotic):
1. **Confirmation**: a positive commit (apply filter, set sort, open a watch link).
2. **Action**: neutral button press (Watch, Shuffle press, Clear, theme toggle).
3. **Stack / folder**: opening and closing a container of child actions (Filters panel, Sort panel, About drawer, any menu). Open and close should be audibly related (rising vs falling).
4. **Navigation / mode switch**: Gallery/Index toggle, entering and leaving Filters.
5. **Globe**: soft tick as posters cross the centre while spinning (rate-limited and velocity-scaled), catch, release/settle.
6. **Shuffle**: whoosh on spin start, landing accent on arrival.
7. **Details open/close**: card opening and closing (can merge with Stack if the owner prefers fewer categories).
8. **Error / empty**: gentle negative cue for failed load or zero results (never harsh).
9. **Music**: ambient background loop, separate toggle and volume weighting.

The owner decides the final list, naming and grouping during the interview.

### Audio engine
- One small module (suggested location `app/audio/` or `app/lib/audio/`; confirm with the owner) exposing a typed API such as `play(category, variant?)`, `setEnabled`, `setCategoryEnabled`, `setVolume`, `startMusic`/`stopMusic`, and a React hook or store slice for settings. Prefer the existing Zustand store (`app/store/`) for settings state if it fits; otherwise a tiny standalone store.
- Use the **Web Audio API** (`AudioContext`, gain nodes: master, per-category, music bus). Sounds can be (a) synthesised in code (oscillators and envelopes; zero asset weight, ideal for ticks and clicks) and/or (b) short pre-rendered files in `public/` (suggest `public/audio/`; use compressed formats, with a fallback if Safari needs it). Ask the owner which approach, and about asset licensing for music (royalty-free source, attribution requirements). Do not invent or download audio without the owner's approval.
- **Autoplay policy**: never create or resume the `AudioContext` before a user gesture. Create it lazily, and call `resume()` inside the first trusted gesture (for example the toggle click that enables sound). Handle `state === 'suspended'` and `'interrupted'` (iOS Safari), and re-resume on `visibilitychange` or the next gesture. Pause music when the tab is hidden.
- **Lazy and zero-cost when off**: no audio code path runs, no files are fetched or decoded, no timers or listeners remain while disabled. Dynamically `import()` the engine on first enable if it is more than trivial. Call sites go through a cheap guard (`if (!enabled) return`) so hot paths (the globe's active-change callbacks) add no measurable cost when off. Do not put audio work inside the engine's `animate`/`render` loop; hook into the existing callbacks (`onActiveItemChange`, `onMovingChange`, `onOpenItem`) from the React layer.
- Rate-limit and debounce high-frequency sounds (globe ticks) and cap polyphony so rapid input cannot stack dozens of voices or clip.
- Respect `prefers-reduced-motion` as an optional quieting rule: propose (do not assume) that when reduced motion is set, the globe tick and shuffle-whoosh categories default off and music stays off until explicitly enabled. Confirm with the owner.
- Optionally honour Save-Data / reduced-data for any file-based audio.

### Settings UI and persistence
- Controls: master on/off, master volume, per-category toggles, music toggle and volume, and ideally a "preview" tap per category. Use existing Radix wrappers in `app/cmps/ui` (`switch.tsx`); add a slider wrapper only if needed (`@radix-ui/react-slider` is not installed; confirm before adding a dependency).
- Suggested placement (owner decides): a "Sound" section in the About drawer (`AboutDrawer` in `test-gallery.tsx`), and/or a small speaker icon button near the theme toggle or the bottom-right `warp-info-button`. First-run discovery should be quiet: no popups, no autoplay prompts; at most a subtle, dismissible hint.
- Persist as one versioned JSON object under a single key (for example `scrollflix.sound.v1`) in `localStorage`; wrap every read and write in try/catch and render correctly when storage is unavailable (private mode, blocked). Validate parsed data (types, ranges) and fall back to defaults. Default: everything off, volume conservative (for example 0.5), per-category toggles all true once the master is enabled (confirm).
- Light and dark themes: style new UI in `app/styles.css` and regenerate `app/light-theme.css` with `npm run theme:light`.

## Constraints and non-regression list

Must not change or degrade: left-drag rotate, hold-to-drag (220 ms), click-to-open (8 px tolerance), wheel nudge, arrow-key spin, Space (shuffle) and Enter (open) shortcuts if landed, Shuffle Pro long-press if landed, details focus and spin-to-item, Escape closing the top-most layer, `?gesture-debug`, the frame loop's "skip drawing when still" optimisation, theme toggle, Gallery/Index switching, keyboard focus order, and screen-reader labels (the `aria-live` region `warp-active-peek` must not become chattier because of audio).
- Audio is purely additive and must never block interaction or throw into UI code: wrap playback in try/catch and make all failures silent.
- No audio plays by default on page load, first paint, or before the owner-confirmed opt-in gesture.
- Bundle size: keep added JS small and keep audio files out of the initial load. Report the bundle delta (`npm run analyze` helps).
- Accessibility: sound is never the only channel for information. Toggles show visible state and are keyboard operable.
- Do not commit audio you cannot license. Do not add analytics.

## Open questions for the owner interview

1. Which categories do you want, and should some be merged (for example Stack + Details)?
2. Synthesised sounds, sampled files, or a mix? What character (soft cinematic, tactile UI clicks, retro)? Any reference products?
3. Music: source, license, length and loop strategy, whether it ducks during details/watch, whether it keeps playing in Index mode.
4. Where should settings live (About drawer, dock icon, both)? Should there be a first-visit hint?
5. Default volumes and the reduced-motion / reduced-data behaviour.
6. Should globe ticks scale with spin speed? Any hard cap on how busy it gets?
7. Mobile: on iOS the silent switch mutes Web Audio unless an HTML audio element is used. Is that acceptable?

## Acceptance criteria

- With sound off (default): no `AudioContext` created, no audio network requests, no new per-frame work (verify in DevTools Performance and Network), and zero console errors.
- First enable happens from a user gesture; sounds then play on iOS Safari, Chrome, Firefox and Edge without autoplay errors.
- Every category toggle silences exactly its sounds; master volume scales everything; music has its own toggle; preferences survive reload; corrupted or missing storage falls back to defaults without throwing.
- Rapid spinning, shuffle spam and wheel scrolling do not clip, stack voices unboundedly, or drop frames.
- All non-regression items still behave identically (run `npm run check`, `npm run build`, `npm run test:unit`, and the Playwright e2e suite where relevant).
- Settings UI is polished in both themes, responsive on mobile and desktop, keyboard-accessible, and matches the existing design language (reviewed with the frontend-skill).
- Unit tests for the settings store (defaults, persistence, validation) and the rate limiter; document the final category map in a comment at the top of the audio module.
