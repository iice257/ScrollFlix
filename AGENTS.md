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

This is a React application that visualizes film data using WebGL and a custom Voronoi force simulation called "Voroforce". The app renders thousands of film posters in an interactive force-directed diagram.

### Key Components

**Frontend Stack:**
- React 19 with TypeScript and Vite
- Tailwind CSS with Radix UI components
- Zustand for state management
- React Hook Form with Valibot for validation

**WebGL Engine:**
- Custom Voroforce library (`voroforce/`) - vanilla JS force simulation engine
- OGL (lightweight WebGL library) for 3D rendering
- GLSL shaders for visual effects
- Multi-threaded simulation support

**App Structure:**
- `app/main.tsx` - Entry point, renders the gallery app (`TestGalleryApp` from `app/cmps/views/test-gallery/`)
- `app/store/` - Zustand store split into UI, Voroforce, and film-data slices, plus selectors
- `app/vf/` - Voroforce integration layer connecting the WebGL engine to React
- `app/cmps/` - React components (UI, layout, views)
- `voroforce/` - Standalone WebGL simulation engine

### Data Flow

1. Film data is loaded from JSON files in `public/json/`
2. Images are served from `public/media/` with multiple resolution variants
3. Voroforce engine processes data into force-directed simulation
4. React components interact with Voroforce through the store
5. User interactions trigger mode changes (intro, select, preview)

### Code Style

The project uses Biome for formatting and linting with these key conventions:
- Single quotes for JS/TS strings
- 2-space indentation
- Semicolons only when needed
- Tailwind CSS class sorting enabled
