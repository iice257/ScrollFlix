# AGENTS.md

This file provides guidance to AI coding agents (Claude Code, Codex, and others) when working with code in this repository. `CLAUDE.md` imports this file, so edit it here.

## Development Commands

- `npm run dev` - Start development server on port 3000
- `npm run build` - Build the application with TypeScript compilation
- `npm run preview` - Preview the built application
- `npm run lint` - Lint code with Biome
- `npm run format` - Format code with Biome
- `npm run check` - Run Biome checks (lint + format)
- `npm run check:write` - Auto-fix Biome issues with unsafe fixes
- `npm run analyze` - Build with bundle analysis enabled

## Testing Commands

- `npm run test` - Run unit tests with Vitest
- `npm run test:unit` - Run unit tests with Vitest
- `npm run test:unit:coverage` - Run unit tests with coverage report
- `npm run test:e2e` - Run end-to-end tests with Playwright
- `npm run test:e2e:headed` - Run E2E tests in headed mode (visible browser)
- `npm run test:e2e:ui` - Run E2E tests with Playwright UI

## Architecture Overview

This is a React application that shows films as a wall of posters wrapped around a 3D globe. You spin it, open a poster for details, and browse the same films as an index or through filters. The globe is a hand-written WebGL2 engine; there is no third-party rendering library.

### Key Components

**Frontend Stack:**
- React 19 with TypeScript and Vite
- Tailwind CSS with Radix UI primitives (`app/cmps/ui/`)

**WebGL Engine:**
- `InfiniteMovieEngine` in `app/cmps/views/test-gallery/infinite-movie-menu.tsx` - instanced poster quads, a single texture atlas, arcball rotation with inertia, and deterministic poster picking
- `app/cmps/views/test-gallery/honeycomb-layout.ts` - relaxed, evenly spaced poster positions on the sphere
- Inline GLSL shaders for the poster stretch, rounded corners and back-face dimming

**App Structure:**
- `app/main.tsx` - Entry point, renders the gallery app (`TestGalleryApp` from `app/cmps/views/test-gallery/`)
- `app/cmps/views/test-gallery/test-gallery.tsx` - the page shell: gallery, index and filters views, movie details, and the dock
- `app/styles.css` - all styling; `app/light-theme.css` is generated from it by `npm run theme:light`, so never edit it by hand
- `app/cmps/ui/` - shared UI primitives
- `app/utils/telemetry/` - opt-in error telemetry

### Data Flow

1. Film data is loaded from JSON in `public/json/`
2. Poster thumbnails are served from `public/media/posters/`, with a tiny `public/media/poster-sprite.jpg` used as an instant placeholder
3. The globe lays the posters out once, uploads them into a texture atlas as they load, and draws only when something moved
4. User interactions open the details card, switch views, or apply filters in the page shell

### Code Style

The project uses Biome for formatting and linting with these key conventions:
- Single quotes for JS/TS strings
- 2-space indentation
- Semicolons only when needed
- Tailwind CSS class sorting enabled
