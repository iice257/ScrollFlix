> **Status (2026-10-07):** the Voroforce engine and the old app shell were removed in [#5](https://github.com/iice257/ScrollFlix/pull/5) (merge commit `16b4d9d`). This document predates that change and is kept as a historical planning note. References to Voroforce, `app/vf` and the old app describe code that is no longer on `main`; see the git history before that commit.

[ ] 1. Establish architecture documentation for app, vf integration, and voroforce engine boundaries; include a system diagram and data flow from public/json to UI.  
[ ] 2. Define a typed public interface for Voroforce (app/vf): create a minimal facade that React uses, isolating engine internals behind explicit methods/events.  
[ ] 3. Extract and document a schema for display uniforms and mode/theme transitions (app/vf/config/display) to reduce implicit coupling and magic numbers.  
[ ] 4. Introduce domain types for Film, FilmBatch, FilmData at the edges (loader, store, components) and validate with Valibot during ingestion.  
[ ] 5. Create a configuration layer contract: centralize controls/config defaults (voroforce/controls/default-controls-config.js) and production overrides to avoid debug features in prod builds.  
[x] 6. Split Zustand store into slices (UI slice, Engine slice, Data slice) to reduce the single large store file and improve maintainability.  
[x] 7. Add selector helpers and memoized derived state to minimize re-renders and avoid duplicated boolean flags (e.g., isPreviewMode/isSelectMode/isIntroMode derived from mode).  
[x] 8. Persist only necessary user settings to storage with a migration strategy; avoid persisting transient runtime state (e.g., dev toggles, ephemeral flags).  
[x] 9. Introduce React ErrorBoundary at app root with user-friendly fallback for unexpected errors, including WebGL initialization failures.  
[ ] 10. Implement capability detection and graceful fallback when WebGL/ANGLE or required extensions are unavailable; surface SmallScreenWarning-like UX for unsupported devices.  
[ ] 11. Profile pointer handling in voroforce/controls/controls.js; extract speed history and gesture detection into small modules with unit tests and clear thresholds.  
[ ] 12. Gate console logging and DebugMarker behind a single isDebug flag; strip debug logs from production builds (Vite define or babel plugin).  
[ ] 13. Replace repeated onPointerDown preventDefault/stopPropagation patterns with a reusable util to ensure consistent behavior across buttons.  
[ ] 14. Ensure interaction handlers are passive where possible (or justify non-passive for gestures).  
[ ] 15. Add strict types (via JSDoc or TS) to voroforce/utils/styles.js and validate style keys; consider converting simple utils to TypeScript.  
[ ] 16. Reduce the size of voroforce/controls/controls.js by extracting: (a) speed averaging, (b) jolt/shake freeze logic, (c) zoom handling, (d) pointer detach/attach lifecycle.  
[ ] 17. Break up voroforce/simulation/steps/forces-step/forces/omni-force.js into smaller functions and data structures; remove the need for // @ts-nocheck by typing arguments incrementally.  
[ ] 18. Add unit tests for voroforce math utilities (clamp, lerp, minLerp, mapRange, diaphragmaticBreathing) to lock down numerical behavior.  
[ ] 19. Verify simulation threading model; if workers are used, document the message contract; otherwise, evaluate offloading heavy steps to a Worker with transferable buffers.  
[ ] 20. Introduce a lightweight performance overlay (hooking PerformanceMonitorApi in store) to show FPS, CPU time, and memory where available.  
[ ] 21. Add Playwright E2E coverage for: intro -> select -> preview flows, opening/closing settings/about/favorites and theme toggle visibility rules.  
[x] 22. Add a unit test framework (Vitest + @testing-library/react) for component and store tests; wire to npm test scripts alongside Playwright.  
[x] 23. Add snapshot tests for key UI components with deterministic props to catch accidental visual regressions (non-canvas parts).  
[ ] 24. Ensure accessibility for icon-only buttons: add aria-labels and ensure focus styles; audit Radix components for correct roles/labels.  
[ ] 25. Provide keyboard navigation for core UI actions (open settings/about, toggle theme where allowed) and ensure trap focus within dialogs.  
[ ] 26. Add reduced motion support: respect prefers-reduced-motion in animation utilities and WebGL transitions where feasible.  
[ ] 27. Implement content security policy (CSP) suitable for WebGL: disallow unsafe-inline, self-host fonts/assets, and document required directives.  
[ ] 28. Switch COEP header to 'require-corp' in production; keep 'credentialless' for dev if needed; ensure media hosting sends proper CORP headers.  
[ ] 29. Self-host DM Sans font (currently loaded from Google) or add preconnect and integrity; document font loading strategy and CSP compatibility.  
[ ] 30. Add Subresource Integrity (SRI) or remove external CDN dependencies in favor of local assets to simplify CSP.  
[ ] 31. Configure GitHub Actions (or preferred CI) to run: npm install, biome check, ts typecheck, vite build, and Playwright tests on PRs; upload playwright-report artifact.  
[ ] 32. Enforce pre-commit hooks with Biome (lint/format) and typecheck via simple pre-commit/pre-push Husky + lint-staged setup.  
[ ] 33. Add bundle analysis budget and CI check: fail builds when JS bundles exceed defined thresholds; document target sizes.  
[ ] 34. Optimize image pipeline: ensure media variants have width/quality budgets; add cache headers and preloading strategy for above-the-fold assets.  
[ ] 35. Implement chunked film data loading (FilmBatch) with backpressure to avoid main-thread stutters; document batch sizes and heuristics.  
[ ] 36. Add retry and timeout policies for JSON/media fetching with user feedback; centralize fetch wrappers with typed responses.  
[ ] 37. Harden storage utils: namespace keys, handle quota exceeded, and add migrations for userConfig changes.  
[ ] 38. Normalize Tailwind theme tokens and reduce custom CSS where Tailwind utilities suffice; codify class naming via cva or utility helpers.  
[ ] 39. Ensure overscroll/touch-action settings are consistent across platforms; test scroll blocking and gestures on iOS/Android (mouse custom variant already present).  
[ ] 40. Add a central feature flag system (env-driven) to toggle heavy effects (media distortion, pixel search radius, border roundness) without code changes.  
[ ] 41. Create an ADR for using OGL vs alternatives and for the Voroforce custom engine, capturing trade-offs and maintenance plan.  
[ ] 42. Extend README with a Troubleshooting section (GPU/driver issues, COEP/CORS, memory limits) and a Performance Tips section for users.  
[ ] 43. Add a developer setup guide covering env vars, data sources, test running, debugging WebGL, and common scripts.  
[ ] 44. Document and validate env vars (e.g., VITE_ANALYZE_BUNDLE, VITE_COMPRESS_GLSL) with defaults and examples in .env.local.example.  
[ ] 45. Review and document license and attribution for media, libraries, and fonts; add NOTICE if required.  
[x] 46. Add robots.txt and optional sitemap.xml generation for public deployments; clarify indexing expectations.  
[ ] 47. Create a security checklist for releases (CSP, headers, dependency audit, Playwright hardening tests, sensitive data scan).  
[x] 48. Add a minimal crash/telemetry hook (opt-in) to capture fatal errors and device classes for performance insights; document privacy stance.  
[ ] 49. Implement a cleanup routine on unmount/app close to prevent memory leaks in WebGL (dispose buffers, textures, event listeners).  
[ ] 50. Provide a CPU/GPU quality preset switch (minimal/mobile/default) that maps to Voroforce config uniforms and engine parameters with clear documentation.  
