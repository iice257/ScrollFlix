# Handoff: Middle-mouse camera controls (and touch equivalents)

You are a fresh session with no prior context. This document is self-contained. Where something is unknown it is stated as an assumption to confirm with the owner.

## Goal

Add extra camera controls to the globe without touching existing behaviour:
- **Middle mouse button (MMB) drag pans** the view.
- **Modifiers add further controls.** Proposal (for the owner to confirm): Shift+MMB = zoom/dolly, Ctrl+MMB = roll/tilt. Other modifiers (Alt, Meta) reserved or unused unless the owner says otherwise.
- **Mobile equivalent: two-finger gestures** (two-finger drag = pan, pinch = zoom, two-finger twist = roll), designed so they do not fight the browser's own pinch-zoom and scroll gestures.

## Mandatory first step: map the blast radius

Before writing any code, produce (and show the owner) a written map of every place that touches the camera/orientation/control code and every pointer, touch, wheel, mouse and keyboard handler that can reach the globe. At minimum, grep for: `ArcballControl`, `.control.`, `orientation`, `cameraPosition`, `cameraRestZ`, `viewMatrix`, `projectionMatrix`, `snapTargetDirection`, `snapStrength`, `nudge(`, `beginPointerDrag`, `movePointerDrag`, `endPointerDrag`, `cancelPointerDrag`, `spinToItem`, `cancelSpin`, `setDetailFocus`, `capturePickSnapshot`, `pickFromSnapshot`, `onPointer`, `onWheel`, `onTouch`, `onMouse`, `addEventListener('keydown'`, `touchAction`/`touch-action` (CSS and TS), `setPointerCapture`, `contextmenu`, `auxclick`, `gesturestart`. State what each caller assumes (for example that `cameraPosition[2]` eases back to `cameraRestZ`, that the globe's centre is the focal/active poster, that `isSpinning()` gates "catch" presses, that `renderDirty` and the "still" check decide whether a frame is drawn).

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

## Current behaviour (verified at 37e36dd; re-verify)

- **Camera model:** the camera is a fixed perspective camera on +Z; the globe itself rotates. Orientation is a quaternion in `ArcballControl` (`orientation`, `pointerRotation`, inertia via `rotationVelocity`/`combinedQuat`, snap via `snapTargetDirection`). The engine eases `cameraPosition[2]` toward a target (used for the details-open dolly and "rest" distance `cameraRestZ`), builds `viewMatrix` from `cameraMatrix`, and `projectionMatrix` via `perspectiveMat4`. There is no pan offset, roll or user zoom today; adding any of these changes what the hit picker (`capturePickSnapshot`/`pickFromSnapshot`), the "nearest poster to centre" logic, `setDetailFocus` and spin-to-item assume (the focal point is the screen centre).
- **Pointer handling** (React handlers on the canvas in `InfiniteMovieMenu`): `handlePointerDown` ignores `event.pointerType === 'mouse' && event.button !== 0`; otherwise it starts a `PressState`, calls `setPointerCapture`, and either starts a "catch" drag immediately if `isSpinning()` or arms a 220 ms hold timer (`HOLD_TO_DRAG_MS`). `handlePointerMove` converts movement beyond `CLICK_MOVE_TOLERANCE_PX` (8) into a drag. `handlePointerUp` ends a drag or, for a plain click, resolves the press snapshot with `pickFromSnapshot` and calls `openHit`. `handlePointerCancel` cancels. `pressRef` tracks a single `pointerId`; there is no multi-pointer tracking at all.
- **Wheel:** `handleWheel` on `div.warp-infinite-menu` nudges the globe via `engine.nudge(dx, dy)` (Shift swaps axes to turn a vertical wheel into horizontal spin); ignored while details are open.
- **Keyboard:** window-level arrow-key effect (`nudge` per key, rAF loop while held, blocked when `!isActive`, details open, or typing target; ignores Alt/Ctrl/Meta). Space = shuffle and Enter = open details may have landed in `test-gallery.tsx`.
- **Touch:** `ArcballControl` sets `canvas.style.touchAction = 'none'`, so the browser does no native panning/zooming on the canvas; `app/styles.css` (around line 2412) also has a `touch-action: none` rule, and `body` has `touch-pan-x touch-pan-y` ("prevent pinch-zoom at page bottom") near line 142 (verify what these select). One-finger touch currently behaves like the left mouse button.
- **Shuffle Pro** (may have landed): press and hold on the globe for 5 seconds triggers an easter egg. It shares the press/hold state with hold-to-drag, so it must be understood before any multi-pointer logic is added.
- **Details focus:** `setDetailFocus` snaps the globe so the opened poster faces the camera, and `spinToItem` (used by Shuffle) spins until the target is within `SPIN_ARRIVAL_DOT` of centre, then calls `onArrive`. Manual input cancels a spin (`cancelSpin`).
- **Windows autoscroll:** pressing MMB on a page can start the browser's autoscroll cursor, and releasing/clicking may fire `auxclick`; today MMB reaches no handler on the canvas.

## Requirements

### Desktop (mouse)
- **MMB drag = pan.** Define "pan" precisely with the owner: translate the camera/view in screen space (view-space x/y offset), bounded so the globe cannot be lost off-screen, and decide whether it eases back to centre on release (recommended default: it springs back, or has a visible "reset view" affordance such as double-middle-click, key `0`/`Home`, or the brand button). Because the product's model is "the poster at screen centre is the active one", panning must not silently break active-poster detection, picking, shuffle arrival or details focus; either keep those anchored to the globe's own centre (apply the pan as a pure view-space translation and compensate wherever screen centre is assumed) or spring back before those flows run. State the chosen approach and why.
- **Shift+MMB = zoom/dolly** (proposed): vertical drag changes the camera distance within hard min/max limits, sharing the existing `cameraPosition[2]` easing so details-dolly and user zoom compose rather than fight. Define what happens to user zoom when details open and close.
- **Ctrl+MMB = roll/tilt** (proposed): horizontal drag rotates the view around the view axis (or tilts), bounded or auto-levelling (owner decision).
- Modifiers are read at pointer-down and latched for the gesture (do not re-evaluate mid-drag unless the owner wants live switching). Ctrl+wheel is the browser's zoom, so do not repurpose it. Do not reuse Shift+wheel (already swaps wheel axes).
- **Pointer routing:** implement MMB (and its modifiers) as a separate, explicit gesture state alongside `pressRef`, not by loosening the `button !== 0` early return in a way that lets MMB start a hold timer, a click or a poster open. MMB release must never open a poster. Use pointer events (`event.button === 1`, `event.buttons & 4`) and pointer capture consistently with the existing code; cancel cleanly on `pointercancel`, `blur`, `visibilitychange`, and if the mouse leaves the window.
- **Suppress Windows autoscroll, scoped to the canvas only:** `preventDefault()` on `pointerdown` (button 1) and on `mousedown` and `auxclick` for button 1, attached to the canvas element only. Be aware that `preventDefault` on `pointerdown` does not cancel the later compatibility `mousedown` default, so autoscroll suppression needs `mousedown` (non-passive) as well; test on Windows Chrome and Edge, and Firefox (which also uses MMB for autoscroll, gated by a setting). Do not suppress MMB on links, the dock, panels, the Index list or anywhere outside the canvas (MMB-to-open-in-new-tab on real links must keep working).
- `contextmenu`, if the custom right-click menu has landed, must be left alone by this work.

### Touch / trackpad (mobile equivalent)
- One finger keeps today's behaviour exactly (drag rotate, tap to open, hold-to-drag, Shuffle Pro).
- **Two-finger gestures:** pan (centroid translation), zoom (inter-finger distance change) and roll (angle change between fingers). Because pan, pinch and twist overlap and can each fire during a sloppy gesture, require a **gesture-classification** step: track both pointers by `pointerId`, and over the first N pixels or M milliseconds (tune; propose about 8 to 12 px and 80 to 120 ms) compute centroid translation, change in finger distance (ratio), and change in angle. The first component to exceed its threshold wins and the gesture is then **locked** to that mode (optionally allow a deliberate switch only after both fingers lift). Document thresholds as constants beside `HOLD_TO_DRAG_MS` and expose them in the `?gesture-debug` panel if sensible.
- **Cancel one-finger state when a second finger lands:** clear the hold timer and any in-progress drag or Shuffle Pro timer, without firing a click or opening a poster, and without leaving `ArcballControl.isPointerDown` stuck true. Conversely, lifting one finger of a two-finger gesture must not suddenly start a one-finger drag with the remaining finger (require a fresh touch).
- **touch-action implications:** `touch-action: none` on the canvas (already set) is required for pointer events to deliver multi-touch move streams without the browser claiming pan/pinch; verify no ancestor or stylesheet overrides it. Check the `body`'s `touch-pan-x touch-pan-y` rule and any page-level pinch-zoom policy so the canvas gesture does not also zoom the page. Dock, panels, details card and the Index list must keep their normal touch scrolling.
- **Safari / iOS:** Safari ignores some `touch-action` behaviour for pinch; add a canvas-scoped `gesturestart`/`gesturechange`/`gestureend` listener (Safari-only events) that calls `preventDefault()` when the gesture starts on the canvas. Also check double-tap-to-zoom and the viewport meta tag (`index.html`; do not disable page zoom globally for accessibility without the owner's approval; scope the prevention to the canvas). Test on a real iOS device or the best available emulation, and Android Chrome.
- Trackpad: on desktop trackpads a pinch arrives as `wheel` events with `ctrlKey: true`, and two-finger scroll arrives as plain `wheel` (already handled as nudge). Decide with the owner whether trackpad pinch should map to the same zoom control (suggested) without breaking the existing wheel nudge.

## Constraints and non-regression list

None of the following may change in behaviour, timing, or feel (verify each explicitly, ideally by a short automated or scripted check):
1. Left-button drag rotate, including inertia and snapping.
2. Hold-to-drag (220 ms) and the catch-a-spinning-globe press.
3. Click-to-open a poster (8 px tolerance) and the picker's results.
4. Wheel nudge (including Shift axis swap) and its clamping.
5. Arrow-key spin (initial nudge plus held rAF spin).
6. Space = shuffle and Enter = open details (if landed).
7. Shuffle Pro 5-second long-press (if landed).
8. Details open/close focus, `setDetailFocus` snapping and the details dolly, and `spinToItem` arrival (Shuffle).
9. Escape layering, `?gesture-debug` overlay, `isTypingTarget` guards, `inert` handling of the wall in other modes, pause/resume of the frame loop, and the "skip drawing when still" optimisation (any new pan/zoom/roll state must participate in the still check or invalidate via `renderDirty`, and must settle to a still state when idle).
10. Dock, panels, Index list, About and details card interactions and touch scrolling outside the canvas.
- No new document-wide listeners that capture input from other UI; everything canvas-scoped and cleaned up on unmount. No per-frame allocations in the control path; reuse typed arrays/quats like the existing code.
- New state lives in `ArcballControl` / the engine (not React state updated per frame). Expose small, typed methods (for example `beginPan/movePan/endPan`, `setUserZoom`, `setRoll`, `resetView`) and keep the React handlers thin.
- Accessibility: provide a keyboard path to reset the view; do not make pan/zoom the only way to reach anything; respect `prefers-reduced-motion` for any spring-back animation (shorten or snap).
- Any hint UI must be minimal and styled in `app/styles.css` (regenerate `app/light-theme.css` with `npm run theme:light`); do not hand-edit the generated file.

## Open questions for the owner interview

1. Pan semantics: spring back on release, persist until reset, or bounded? How is it reset (key, double-middle-click, button)?
2. Confirm Shift+MMB = zoom and Ctrl+MMB = roll, or choose other mappings (also Alt+MMB?). Zoom limits? Roll auto-level?
3. Should user zoom/pan reset when details open, on Shuffle, or on mode switch?
4. Touch: do you want pan, zoom and roll all on two fingers (classified), or a smaller set? Trackpad pinch support?
5. Is it acceptable to prevent Safari/page pinch-zoom on the canvas only?
6. Should these be discoverable (About controls list `AboutControls`, a hint), and how?
7. Any minimum supported browsers/devices for the touch work?

## Acceptance criteria

- MMB drag pans smoothly with no Windows autoscroll cursor on the canvas, no poster opens on MMB release, and MMB behaves natively outside the canvas (for example middle-clicking a real link still opens a new tab).
- Shift+MMB and Ctrl+MMB perform the confirmed zoom and roll with limits; releasing returns to a still state and the render loop idles again (verify "skip draw" resumes).
- Two-finger pan, pinch and twist are cleanly classified and locked; no gesture bleeds into another; adding or removing a finger never triggers a click, an open, a stuck drag, or a Shuffle Pro trigger; page zoom and scroll are not triggered by gestures on the canvas, on iOS Safari and Android Chrome.
- Every item in the non-regression list passes. Run `npm run check`, `npm run build`, `npm run test:unit`, and add Playwright e2e coverage for MMB (`page.mouse` with `button: 'middle'`), modifier combos, and a touch-emulated two-finger gesture where feasible; do manual device checks for Safari gestures.
- The blast-radius map is delivered to the owner before coding, and updated at the end with what was actually touched.
- Frame-time and idle behaviour are unchanged versus baseline (compare Performance traces).
- Controls feel intentional and polished in both themes and on mobile and desktop (reviewed with the frontend-skill if any UI, hint or reset affordance is added).
