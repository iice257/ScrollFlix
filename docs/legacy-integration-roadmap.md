# Legacy Integration Roadmap

> **Status (2026-10-07):** the Voroforce engine and the old app shell were removed in [#5](https://github.com/iice257/ScrollFlix/pull/5) (merge commit `16b4d9d`). This document predates that change and is kept as a historical planning note. References to Voroforce, `app/vf` and the old app describe code that is no longer on `main`; see the git history before that commit.

This document controls the removal and reuse of the previous renderer and product shell. The current gallery, local poster pipeline, catalog JSON, and their uncommitted changes are protected baselines.

## Rules

1. Keep one canonical movie model, preferences owner, overlay system, filter engine, and poster pipeline.
2. Merge capabilities into existing gallery surfaces; never retain parallel implementations.
3. Migrate persisted user data before deleting its previous schema.
4. Reference-only research stays in Git history or an architecture note, not dormant production code.
5. Every bucket ends with focused tests, a build, gallery E2E checks, and an import/reference sweep.

## Bucket A: required, no current counterpart

- Versioned migration for favorites, custom links, theme, and reduced-motion preferences.
- Favorites model and responsive saved-movie experience.
- Standard and user-defined outbound movie links, including validation, substitution, sharing, and editing.
- Recommendation scoring, discovery tags, and human-readable similarity reasons.
- An accessible responsive overlay boundary with focus trapping, restoration, Escape handling, and meaningful labels.

## Bucket B: required or high value, partial current counterpart

- Enrich the existing details surface with rating, richer metadata, favorite/link actions, and explained recommendations.
- Replace watch placeholders with the canonical standard/custom link source.
- Consolidate existing gallery filters with useful year range and persisted settings; remove duplicate filter engines.
- Consolidate motion and responsive drawer behavior into one reduced-motion-aware system.
- Add visibility pause/resume, explicit GPU resource disposal, prioritized poster loading, and adaptive-quality signals where current renderer gaps are proven.
- Add gallery-owned theme, fullscreen, and interface visibility controls only where they fit the current chrome.

## Bucket C: valuable optional research

- Non-blocking GPU picking with pixel-pack buffers and fences.
- Texture-array subimage streaming and compressed atlas techniques.
- Multiple-render-target/post-processing architecture.
- SharedArrayBuffer/worker structure-of-arrays and GPU-mirrored state.
- Advanced pointer velocity, bounds, orientation, and gesture experiments.
- Developer-only performance HUD and enriched diagnostics.
- Onboarding, hotkey visuals, historical screenshots, and experimental motion references.

Bucket C requires an architecture decision record and benchmark or prototype before entering production.

## Bucket D: current implementation wins

- Gallery search, genre/mood/runtime decisions, list/grouping views, current details/watch shells, poster globe, local poster generator, catalog loader, error boundary, UI primitives, and design tokens.
- Harvest only missing edge cases and tests from older counterparts, then remove the duplicate implementation.

## Bucket E: obsolete and removable

- Force and neighbour simulation, cell/grid state, and simulation-only workers.
- Old renderer initialization, modes, bridges, route shell, cell navigation, and canvas-jump actions.
- Simulation presets, force configuration, developer seed/debug controls, and renderer-specific hotkeys.
- Obsolete compressed runtime assets after their pipeline is recorded.
- Old technical product copy after legal, attribution, and useful historical material is retained.

## Integration order

1. Lock the gallery baseline and canonical domain boundaries.
2. Implement preference migration.
3. Integrate favorites and custom links.
4. Merge those actions into existing details and watch surfaces.
5. Integrate recommendations into the existing details surface.
6. Consolidate filters, settings, overlays, and motion.
7. Compare and selectively transplant renderer resilience techniques.
8. Record Bucket C research as decisions/prototypes only.
9. Prove parity and remove duplicate implementations.

## Regression gates

- Existing poster availability and no-browser-time-image-fetch contract remains intact.
- No second movie model, preferences store, overlay framework, filter engine, or poster pipeline is introduced.
- Persisted migrations are idempotent and tolerate corrupt data.
- Keyboard, focus, mobile, and reduced-motion behavior are verified.
- Renderer changes include cleanup/context-loss/visibility checks and a measurable performance budget.
- Typecheck, lint, unit tests, production build, root E2E flows, and final legacy-reference searches pass.
