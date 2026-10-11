# ScrollFlix: continue the desktop refinement pass

You're picking up from a previous session. Read this whole prompt, then AGENTS.md and CLAUDE.md, before doing anything.

## Where things stand

- **Repo:** `C:/Users/0/Documents/Projects/Github/What-to-watch` (branch `main`).
- **Work branch:** `refine/desktop-pass`, checked out as a git worktree at `C:/Users/0/Documents/Projects/Github/What-to-watch-refine`. `node_modules` there is a junction to the main repo's. Do all work in the worktree. Merge to `main` only at the end, after the owner signs off.
- **Dev server:** `.claude/launch.json` in the main repo has a `refine` config that serves the worktree on port 3060. Start it with preview_start `{name: "refine"}`. If the browser pane is hidden, the globe doesn't render (requestAnimationFrame pauses), and calling preview_start again brings it back. Click "Skip" on the preloader only while it's still loading. Once loading is done the preloader stops catching clicks, so a click there lands on the globe and opens a poster.
- **Checks:** `npx vitest run app/cmps/views/test-gallery` (49 tests passing), `npx tsc -p tsconfig.app.json --noEmit`, `npx biome check app`. All clean at the latest commit.
- **Light theme:** `app/light-theme.css` is generated from `app/styles.css`. Run `npm run theme:light` after changing colours, and never hand-edit it.

### Commits on `refine/desktop-pass`, on top of `main` at 37e36dd

1. `26f8f41`: deterministic elliptical hit area (`infinite-movie-menu.tsx`).
   - **Snapshot:** `capturePickSnapshot` runs on pointerdown and `pickFromSnapshot` on release, using the pure helpers `ellipseIntersectsQuad`, `pointToQuadDistance` and `pickWinner`.
   - **Ellipse:** centred on the canvas at x 0.5, y 0.48, with radii 0.34 × width and 0.37 × height.
   - **Rules:** the poster under the point wins; otherwise the nearest poster inside the ellipse; otherwise a miss.
   - **Tuning:** `?gesture-debug` draws the ellipse and has sliders for it.
   - **Status:** verified in the browser.
2. `81194a0`: six Index sorts (A–Z is the default, then Year, Rating, Runtime, Popularity and Vote count).
   - Rating is a Bayesian weighted rating from `withWeightedRatings`.
   - Ratings that are 0 or missing show "N/A".
   - Also adds the three handoff prompts in `docs/handoff/` (sound, context-menu, camera-controls). Those are prompts only and must not be implemented here.
3. `fd7a7b6`: Genres page becomes the Filters page (ViewMode `'filters'`).
   - **Shared component:** `FilterSections` is used by both the gallery popover and the page. Sections: Content type, Runtime, Year, Rating, Mood, Genres.
   - **Runtime buckets:** movie runtime uses three contiguous buckets, `movieUnder90`, `movie90to120` and `movieOver120`, via `getRuntimeBucket`.
   - **Year and rating filters:** `selectedYear` (exact year or decade) and `ratingMin` are hard pre-filters.
   - **Clear:** shows only when filters are active, both on the page and in the tab bar next to Back.
   - **CTA:** the top-bar button reads "Home" on the Filters page and goes to the gallery.
   - **Home pill:** reads "Clear | Filters N". When the panel is open, the right side becomes a circle with an X.
4. `38c6a81`: movie card.
   - **Meta line:** inline `2010 · ★ 5.7 · 1h24m · Country`. Year, rating and runtime are buttons that underline on hover.
   - **Tooltips:** "Click to filter" on every clickable tag. Clicking one applies the filter via `onApplyFilter`, closes the card and goes to the gallery.
   - **Next suggestion:** "Show next suggestion" sits under the poster on desktop and in the actions row on mobile. It closes the card and calls `handleShuffle`.
5. `f9fc352`: keyboard and tab bar.
   - **Keys:** Space shuffles and Enter opens the centre movie, gallery only, gated by `shouldHandleGalleryKey`.
   - **Sizing:** the Gallery and Index labels and icons are bigger.
   - **Hover:** the rule applies to pill backgrounds. The title card is white at rest and grey on hover. Every other pill is grey at rest and white on hover. Missing hover states were added.

## What's left, in order

### 1. Finish browser verification of commits 2–5 before starting Shuffle Pro

Commit 1 (the hit area) is already verified. Check these at 1440×900, 1280×720 and 390×844, in both dark and light themes. The theme toggle is in the About panel (the i button).

- **Filters page**
  - Sections and chips take only the space they need, with no horizontal scroll.
  - Clear shows and hides correctly.
  - "Home" goes to the gallery.
  - Year, Rating and Runtime filters change both the globe and the index.
- **Home pill:** check both states.
- **Movie card**
  - Inline meta line, hover underline, and tooltips on hover and on keyboard focus.
  - Each tag click applies the right filter.
  - "Show next suggestion" works.
  - The card fits within 1280×720.
- **Keys:** Space and Enter work with nothing focused. With a dock button focused, they only activate that button.
- **Hover states and mode-toggle sizing:** check in both themes.
- **Earlier commits:** check for regressions in Index sort with multiple active sorts (the badge reads like "A–Z ↑ +1"), and in "N/A" ratings.

Fix anything broken before moving on.

### 2. Build Shuffle Pro (the easter egg), last

It touches `infinite-movie-menu.tsx`, `test-gallery.tsx`, `test-gallery.test.ts`, `infinite-movie-menu.test.ts` and `styles.css`.

The owner's spec is below, with the decisions already made.

**Trigger**
- Press and hold the globe with minimal movement (≤ 10px total from the press point, tracked as `maxMovedPx`) for 5s, or hold while dragging or rotating for 10s.
- The existing 220ms hold-to-drag keeps working alongside this.
- A press that fires Shuffle Pro must not open a poster on release.
- On touch, suppress the native long-press callout and text selection on the globe: `-webkit-touch-callout: none` and `user-select: none` on the canvas, and preventDefault `contextmenu` only while a touch or pen press is active. Desktop right-click must still reach the native menu.
- Make the timing logic a pure, unit-tested function, for example `shouldTriggerShufflePro({ elapsedMs, maxMovedPx })`.

**Sequence**
- **Spin:** when the trigger fires, the engine starts an auto-spin that accelerates. Start around 0.6 rad/s, ease in, and cap at about 7 rad/s.
- **Globe size:** the globe shrinks as speed rises, by pulling the camera back. The engine already raises camera Z with rotation velocity in `onControlUpdate`. Cap the extra pull-back at about +1.4 × `cameraRatio`.
- **Theme transition:** 5s after the trigger, smoothly fade in the alternate-theme overlay, with pointer-events off and gradients kept off the central posters.
  - Dark mode: a light sky-blue aura.
  - Light mode: a dark-blue night sky with twinkling stars.
  - This transition tells the user they can let go. The spin continues for as long as they hold.
- **Release after the transition:** decelerate, then land on a random visible movie through the existing `spinRequest` / `spinToItem` path. Open its card in a special premium frame: an animated gradient border in the theme's hues, a soft glow, and a small "Shuffle Pro pick" eyebrow label. When the card closes, fade the overlay out.
- **Release before the transition:** behaves exactly like a normal shuffle.

**Rare variant**
- **Streak:** the count of consecutive shuffles with no other action in between. Stored in memory only: a ref, no localStorage, so it resets on refresh or when the session ends. The same applies to anything else that counts toward Shuffle Pro.
- **What counts as a shuffle:**
  - the dock Shuffle button
  - Space
  - "Show next suggestion"
  - a user drag spin of at least 90° (the engine adds up the drag rotation plus its inertia and reports it through a callback such as `onLargeSpin`)
- **What breaks the streak:** opening a poster by click or Enter, changing any filter or sort, or switching views. Closing a card that a shuffle opened does not break it.
- **Roll:** from the 10th consecutive shuffle onward, roll a 5% chance on every shuffle until it fires or the streak breaks, then reset the streak. Make this a pure, unit-tested function (inject the random value).
- **Look:** the variant runs automatically during that shuffle's spin. It uses light purple hues with subtle floral and glitter effects (a few petals, a few sparkles), and the landing card gets a purple premium frame. Keep it restrained, not overdone.

**Accessibility:** under `prefers-reduced-motion`, replace the accelerating spin with a gentle fade or pulse, such as a small camera-Z oscillation. Keep the theme shift and the premium frame, and make the stars static.

**Performance:** add nothing per frame while Shuffle Pro is idle.

### 3. Logo (REJECTED attempt; redo it)

- **What the owner asked for:** extract only the icon mark from the source file, convert it to clean SVG, and pair it with a "ScrollFlix" wordmark (not GridFlix). Then make the favicon set: SVG, a 32px PNG and a 180px apple-touch-icon. Show the owner everything for approval before implementing.
- **Source:** `C:/Users/0/Downloads/scrollflix (gridflix logos).png`. A copy is at `docs/brand-rejected/SOURCE-gridflix-board.png`.
- **Rejected attempt:** the owner rejected the first attempt because it doesn't match the mark they sent. It is kept in `docs/brand-rejected/` as an example of what NOT to do:
  - **Wrong approach:** a subagent hand-drew a "similar" globe from scratch (`build-brand.js`).
  - **Wrong result:** a generic tilted 5×4 grid circle with a crescent tail cut out of it. It reads as a speech-bubble globe and isn't faithful to the source.
- **Don't:**
  - Approximate or reinterpret the mark.
  - Invent new geometry.
  - Hand off a mark you haven't compared side by side with the source.
- **Do:**
  1. Crop the actual icon mark from the board. Use the large "02. Full screen logo" or "Symbol only" version, at the highest resolution available.
  2. Vectorize that crop faithfully. Trace it (for example with potrace via npm, or a careful manual trace over the crop) and keep its real cell shapes, curvature, swoosh and gradient. Then clean up the paths.
  3. Render your SVG next to the crop at the same size and confirm they match before showing the owner.
  4. Ask before downloading anything, such as a tracing tool or the DM Sans font for outlining text.
- **Wordmark:** "ScrollFlix", matching the in-app `.warp-brand-name` (DM Sans, weight 950, letter-spacing -0.05em). Make horizontal and stacked versions, each in light and dark.
- **Approval gate:** show the owner a preview of every asset and wait for sign-off before implementing.
- **Once approved:**
  - Copy the assets into `public/`.
  - Add the PNG favicon and apple-touch-icon links to `index.html`.
  - Replace the inline SVG mark in WarpChrome's `.warp-mark` in `test-gallery.tsx` with the new mark.

### 4. Finish

- Run the full checks.
- Check for regressions in untouched behaviour: globe drag, wheel, arrows, detail focus, spin-to-item, Escape layering and the About panel.
- Report to the owner what shipped, what deviated and what's still open.
- After sign-off, merge `refine/desktop-pass` into `main`.

## How to work

- **Owner's execution model:** you orchestrate (scope, write specs, delegate, verify), and Sonnet subagents (model: sonnet) implement, to save tokens.
- **Specs:** each spec is self-contained. It states the goal, the files the agent owns and the files it may only read, current and target behaviour, the decisions already made, acceptance criteria, what's out of scope, and what to report. Agents don't commit; you review each diff, run the checks and commit.
- **Concurrency:** two agents running at the same time must not own the same file. Nearly everything is in `test-gallery.tsx`, so most units run one after another.
- **Frontend:** use the frontend skill for any frontend work.
- **Quality bar:** polished, production-grade UI.
- **Browsers:** the in-app browser is for localhost only. Use Edge for anything else.
- **Doing vs. asking:** if a tool can do it, do it rather than handing the owner commands.
- **Ambiguity:** ask the owner in one batched list. Don't guess on product decisions.
