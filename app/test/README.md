# Testing Setup

This directory contains the testing configuration for the application.

## Framework

- **Vitest** - Fast unit testing framework with native ES modules support
- **@testing-library/react** - Testing utilities for React components  
- **jsdom** - Browser environment simulation for Node.js

## Configuration

- `vitest.config.ts` - Main Vitest configuration
- `app/test/setup.ts` - Global test setup and mocks

## Test Scripts

```bash
npm run test              # Run unit tests in watch mode
npm run test:unit         # Run unit tests in watch mode
npm run test:unit:ui      # Run tests with Vitest UI
npm run test:unit:coverage # Run tests with coverage report
npm run test:e2e          # Run Playwright E2E tests
```

## Test Structure

### Unit Tests
- **Gallery tests** (`app/cmps/views/test-gallery/*.test.ts`) - Sorting, filtering, ratings, picking geometry and layout
- **Component tests** (`app/cmps/**/*.test.tsx`) - React component behavior

### Snapshot Tests
- **UI Components** - Visual regression testing for non-canvas parts
- **Deterministic props** - Consistent snapshots with fixed data

## Mocks

The test setup includes mocks for:
- **WebGL Context** - For components using canvas/WebGL
- **ResizeObserver** - For responsive components  
- **matchMedia** - For media query tests
- **localStorage** - For settings persistence tests
- **Performance API** - For timing-related code

## Coverage

Coverage reports exclude:
- WebGL engine (`app/cmps/views/test-gallery/infinite-movie-menu.tsx`)
- Test files and configuration
- Node modules
- Type definitions

## Best Practices

1. **Deterministic tests** - Use fixed data for consistent results
2. **Isolated tests** - Each test cleans up after itself
3. **Snapshot testing** - For UI components with stable interfaces
4. **Mock external dependencies** - Keep tests focused on unit under test
5. **Test behavior, not implementation** - Focus on what components do, not how

## Examples

### Component Test
```typescript
it('should render with props', () => {
  render(<Component value={42} onChange={mockFn} />)
  expect(screen.getByText('42')).toBeInTheDocument()
})
```

### Snapshot Test
```typescript
it('should match snapshot', () => {
  const { container } = render(<Component value={42} />)
  expect(container.firstChild).toMatchSnapshot()
})
```
