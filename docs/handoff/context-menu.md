# Handoff: Custom right-click menu on the globe

You are a fresh session with no prior context. This document is self-contained. Where something is unknown it is stated as an assumption to confirm with the owner.

## Goal

Replace the native context menu **on the globe canvas only** with a custom, polished menu. Opening it fades out the bottom-bar (dock) items and moves them into the menu as a list. At the top of the menu, visually separated and slightly larger, sit the details of the movie closest to where the click landed. Shift+right-click falls through to the native browser menu. A keyboard trigger (Shift+F10 or the ContextMenu key) opens the same menu anchored at the active/centre movie. Use Radix ContextMenu (what shadcn wraps) as the base. Reuse the engine's existing pick/projection logic; add no per-frame cost and no regressions.

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

- Right-click on the canvas opens the browser's native menu. `handlePointerDown` in `InfiniteMovieMenu` returns early for `event.pointerType === 'mouse' && event.button !== 0`, so right and middle buttons never touch the globe's press/drag/hold state. There is no `onContextMenu` handler anywhere on the canvas (verify with grep for `contextmenu`/`onContextMenu`).
- The dock (`warp-dock` in `WarpChrome`) shows, in gallery mode: Gallery/Index toggle, Watch, Shuffle, Filters pill (with Clear when filters are active); in index mode: Sort, Shuffle, Filters. The bottom-right `warp-info-button` (i) opens About. The Filters pill and Sort are containers that open panels (`FilterPanel`, `SortPanel`).
- The engine's picker (`capturePickSnapshot` at press, `pickFromSnapshot` at release) already snaps to the nearest poster in gaps, but only inside the central hit ellipse; the menu needs the closest poster anywhere on the canvas, so add a query that reuses the same snapshot projection and `pointToQuadDistance` without the ellipse restriction.
- Poster click opens details through `openHit` (sets active item, `engine.setDetailFocus(id, true, 'fast', index)`, calls `onOpenItem`). Wheel, arrows, hold-to-drag and the `?gesture-debug` overlay exist as described in the orientation section.

## Requirements

### Trigger and fall-through
- Open on the canvas `contextmenu` event (right-click, and long-press on touch only if the owner wants it; see questions). Scope strictly to the canvas element (`canvas.warp-infinite-menu-canvas`), not the whole page, dock, panels, details card, About, Index list, or inputs: those keep their native menu.
- **Shift+right-click falls through** to the native menu: when `event.shiftKey` is set do not `preventDefault` and do not open the custom menu. Radix ContextMenu has no built-in modifier bypass, so handle this in an `onContextMenu` guard on the trigger (verify how Radix's `ContextMenu.Trigger` handles a native event whose default is not prevented; the test is that the native menu really appears).
- Keyboard: **Shift+F10** and the **ContextMenu key** open the same menu anchored at the active/centre movie's screen position (not the pointer). Make sure the keyboard path also works when focus is on the canvas or the page body, and that it does not fire while typing in an input (`isTypingTarget` exists in `infinite-movie-menu.tsx`) or while a modal layer (details, watch links, About) is open. Decide with the owner whether it should also open when focus is on a dock button.
- The menu only exists in gallery (wall) mode while the globe is `isActive`. In Index/Filters modes the native menu is untouched (confirm).

### Nearest-movie query (reuse, do not reimplement)
- Add a method on `InfiniteMovieEngine`, for example `nearestInstanceAt(clientX, clientY)`, that returns `{ index, item, screen: [x, y], distancePx } | null`. Build it on the SAME projection code `capturePickSnapshot` uses (view and projection matrices times each instance matrix, front-facing cull `centerZ < sphereRadius * 0.15`, `toScreen` helper). Factor the shared projection into one private helper used by both queries rather than copying it. Prefer the same snapshot-at-press semantics the rewritten picker uses so the movie shown matches what the user actually clicked on.
- It runs once per menu open (an O(instances) loop over a few hundred to a few thousand posters), never per frame and never per pointermove. No allocations in a hot loop beyond what `capturePickSnapshot` already does.
- The anchor for the keyboard path is the engine's active (nearest-to-centre) instance, available via the existing active-item callback / `activeItemRef`; if useful, expose a `centerInstance()` helper rather than recomputing.
- Define "closest" (screen distance to poster centre, with front-facing preference) and a maximum distance beyond which the menu shows no movie header (for example a click in the empty space around the globe), and confirm this with the owner.

### Menu content and layout (design with the frontend-skill, confirm with the owner)
- Top block, separated by a divider and visibly larger than the list items: the movie's poster thumbnail, title, year/meta line (`formatMovieMeta`), genres, and primary actions for that movie (for example Open details, Where to watch). Make sure it reflects the movie nearest the click, and that choosing its actions routes through existing handlers (`openHit`/`handleOpenMovie`/`handleOpenWatchLinks`) so behaviour and focus handling stay identical.
- Below it: the dock items as a vertical list, reusing the same handlers and the same state as `WarpChrome` (Gallery/Index switch, Watch, Shuffle, Filters with count, Clear when active, Sort in index mode, About, theme toggle if present). Do not fork the logic: extract the dock's action list into one shared descriptor (label, icon, handler, disabled, active/badge, children) consumed by both the dock and the menu so they cannot drift. "Stack" items such as Filters can be a Radix `ContextMenu.Sub` (submenu) or can open the existing panel; ask the owner.
- Disabled and conditional rules must mirror the dock (for example Watch disabled without an active movie, Shuffle disabled when there are no visible movies, Clear only when filters are active).
- **Fade out the bottom-bar items while the menu is open** and show them again on close, with matching motion (opacity transition, no layout shift, no `display:none` flicker; respect `prefers-reduced-motion`). Implement via a data attribute on the shell (for example `data-context-menu='open'` on the `main.warp-shell`) styled in `app/styles.css`, mirroring how `data-details-open` / `data-filter-open` already work. The dock should not be interactive while faded (use `inert`/`pointer-events: none`).
- Position: use Radix's collision handling (`avoidCollisions`, `collisionPadding`) so the menu stays on screen on small viewports; it can anchor at the click point or, for the keyboard path, at the active poster's projected centre.
- Styling: add a `app/cmps/ui/context-menu.tsx` wrapper in the style of `dropdown-menu.tsx`, tokens consistent with the existing panels (rounded, blurred glass, spacing rhythm, type scale). Styles go in `app/styles.css`; regenerate `app/light-theme.css` with `npm run theme:light` and check both themes. Add the dependency `@radix-ui/react-context-menu` (not currently installed: verify `package.json`; get the owner's OK to add it).

### Focus and keyboard behaviour
- Opening moves focus into the menu (first actionable item, or the movie header's primary action). Arrow keys navigate, Enter/Space activate, Escape closes, Tab closes or cycles per Radix defaults (confirm), and focus is **restored** to the previously focused element (or the canvas) on close.
- The existing window-level `keydown` handlers must not interfere: the Escape handler in `TestGalleryApp` (closes top-most layer: watch links, details, About, Sort, Filters) and the arrow-key spin handler in `InfiniteMovieMenu` must not act while the menu is open (arrows must navigate the menu, not spin the globe; Escape closes only the menu first). Use the menu's open state, or Radix's event handling plus `stopPropagation`, and verify with tests. Space-to-shuffle and Enter-to-open (if landed) must not fire through the menu.
- While open: the globe should not start a new press/hold, the wheel should not nudge (or should close the menu; ask the owner), and a spinning globe should either keep coasting or be frozen (ask).
- Screen readers: menu role and labels come from Radix; the header block needs a sensible accessible name (for example "Actions for {title}").

## Constraints and non-regression list

Must not change or degrade: left-drag rotate, hold-to-drag (220 ms), click-to-open (8 px tolerance), wheel nudge, arrow-key spin, Space (shuffle) and Enter (open) shortcuts, Shuffle Pro long-press, details focus and spin-to-item, Escape layering, the `?gesture-debug` overlay, theme toggle, Gallery/Index switching, and the picker's results for ordinary left-clicks (the new nearest query must not alter `pickFromSnapshot` behaviour).
- **No per-frame cost and no per-event cost on the globe's hot path**: no new `pointermove` listeners, no work inside `animate`/`render`; the nearest query runs only on menu open. The frame loop's "skip drawing when still" optimisation must remain intact.
- Right-click must not start a drag, a hold timer, or a click; keep the early return for non-primary mouse buttons and handle `contextmenu` separately. Beware that on some platforms (macOS Ctrl+click, long-press on touch) `contextmenu` fires after a `pointerdown` with button 0: make sure a legitimate drag or click never opens the menu, and a menu-open never triggers a poster open on release.
- Touch: do not break one-finger drag or tap. If long-press-to-open is wanted on touch, it must not collide with hold-to-drag (220 ms) or the Shuffle Pro 5-second long-press; propose a clear rule and confirm.
- Native menu stays for: Shift+right-click, everything outside the canvas, text inputs and the Index list.
- No new global event listeners left attached after unmount; clean up in effects. Keep ESM/Biome style (single quotes, no semicolons).
- Do not hand-edit `app/light-theme.css`.

## Open questions for the owner interview

1. Exactly which dock items and which movie actions go in the menu, and in what order? Submenu or inline for Filters and Sort?
2. What should the header show (poster thumb, title, year, runtime, rating, genres) and what are its actions?
3. If the click lands in a gap far from any poster, show the nearest poster anyway, or hide the header?
4. Touch long-press: yes or no? Behaviour when the globe is spinning at open time (coast, freeze)?
5. Should the wheel or a drag close the menu?
6. Should the menu also exist in Index/Filters modes (probably not)?
7. Fade-out treatment for the dock (full fade, partial, also the top bar)?
8. OK to add `@radix-ui/react-context-menu`?

## Acceptance criteria

- Right-click on a poster or gap opens the custom menu at the pointer; the header shows the movie nearest the click; the dock fades out and returns on close; Shift+right-click shows the native menu; right-click outside the canvas shows the native menu.
- Shift+F10 and the ContextMenu key open the menu anchored at the active/centre movie; focus moves into the menu and returns to the prior element on close; Escape closes only the menu; arrows navigate the menu and never spin the globe while it is open.
- Every menu action performs exactly what its dock/panel equivalent does (same handlers), including disabled states and badges.
- The nearest-poster query is shared code with the picker (no duplicated projection maths), is covered by a unit test where feasible (pure projection math with a fake engine state) and verified manually on a large and small item set.
- No measurable frame-time change while idle or spinning (compare Performance traces before and after); the idle "skip draw" still triggers.
- All non-regression items behave identically; verified with `npm run check`, `npm run build`, `npm run test:unit`, and a Playwright e2e covering right-click, Shift+right-click, keyboard open, Escape, and focus restore.
- Polished in both themes, responsive at phone and desktop widths, collision-safe at viewport edges, reduced-motion respected (reviewed with the frontend-skill).
