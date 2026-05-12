# Development Notes

## Dependency Decisions

- `lucide-react` is used for product UI icons.
- Tailwind CSS is installed through the Vite plugin because the target stack includes Tailwind. Current screens still use explicit CSS tokens while the design system stabilizes.
- Zustand is installed because selected view/event/filter state is cross-feature UI state and should not live in a monolithic App component.
- Vitest is installed to validate timeline positioning, relationship traversal, and prompt generation.
- TanStack Query is intentionally not installed yet because there is no backend command or async data boundary.
- Tauri is intentionally not scaffolded yet because the current milestone is the frontend/domain foundation. The next milestone should introduce Tauri carefully with command contracts.

## Validation Commands

```bash
npm run typecheck
npm test
npm run build
```

## Current Frontend Boundaries

The mock data in `src/domain/mock-data.ts` should eventually be replaced by Tauri command results. Feature components should not read from filesystem, SQLite, or LLM providers directly.
