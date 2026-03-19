# Exprsn Style Guide

This document defines the coding conventions and patterns used across the Exprsn codebase.

## General

- **Language:** TypeScript everywhere (strict mode enabled)
- **Target:** ES2022
- **Module System:** NodeNext (backend), ESM (frontend)
- **Package Manager:** pnpm 9.15.0
- **Monorepo Tool:** Turborepo

## Formatting

Formatting is handled by [Prettier](https://prettier.io/) with the following configuration:

```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100
}
```

Run `pnpm format` to auto-format all files. Configure your editor to format on save.

## TypeScript

### Strict Mode

The root `tsconfig.json` enables strict mode with additional safety checks:

- `strict: true`
- `noUncheckedIndexedAccess: true` - Array/object index access returns `T | undefined`
- `forceConsistentCasingInFileNames: true`
- `isolatedModules: true`

### Type Annotations

- Let TypeScript infer types where the inference is obvious
- Add explicit types for function signatures, exported values, and complex expressions
- Prefer `interface` for object shapes and `type` for unions, intersections, and utility types
- Use Zod schemas as the single source of truth for runtime-validated types (derive TypeScript types with `z.infer<>`)

```typescript
// Derive types from Zod schemas
const CreateVideoSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
});
type CreateVideoInput = z.infer<typeof CreateVideoSchema>;
```

### Imports

- Use named imports; avoid default exports in library code
- Group imports: external deps, internal packages (`@exprsn/*`), relative imports
- Use path aliases defined in each package's `tsconfig.json`

## Backend (packages/api)

### Framework: Hono

Routes are organized by domain in `src/routes/`. Each route file exports a Hono router instance.

```typescript
import { Hono } from 'hono';

const router = new Hono();

router.get('/videos', async (c) => {
  // ...
  return c.json({ data: videos });
});

export default router;
```

### Database: Drizzle ORM

- Schema lives in `src/db/schema.ts`
- Use Drizzle's query builder for all database access; never write raw SQL
- Use transactions for multi-step mutations
- Name tables in snake_case, columns in camelCase (Drizzle handles the mapping)

```typescript
const videos = await db
  .select()
  .from(videosTable)
  .where(eq(videosTable.authorId, userId))
  .limit(20);
```

### Validation

- Validate all external input (request bodies, query params) with Zod at the route handler level
- Internal function arguments do not need runtime validation; rely on TypeScript
- Use the shared error code system for consistent error responses

```typescript
router.post('/videos', async (c) => {
  const body = CreateVideoSchema.parse(await c.req.json());
  // body is now typed and validated
});
```

### Error Handling

- Use the standardized error handling system documented in `Markdowns/README_ERROR_HANDLING.md`
- Throw typed errors that map to HTTP status codes
- Never expose internal details (stack traces, SQL errors) in API responses

### Background Jobs

- Use BullMQ for async work (video processing, email, notifications)
- Job processors live in `src/workers/`
- Jobs should be idempotent

## Frontend (packages/web)

### Framework: Next.js

- Use the App Router (`src/app/`)
- Server Components by default; add `'use client'` only when state, effects, or browser APIs are needed
- Pages go in `src/app/`, reusable components in `src/components/`

### Styling: Tailwind CSS

- Use Tailwind utility classes; avoid custom CSS unless absolutely necessary
- Extract repeated patterns into components, not CSS classes
- Use the project's design tokens (colors, spacing, typography) defined in `tailwind.config.ts`

```tsx
<button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
  Upload
</button>
```

### State Management

- **Server state:** TanStack React Query for API data fetching, caching, and mutations
- **Client state:** Zustand stores in `src/stores/` for UI state
- Avoid prop drilling; use context or stores for cross-component state

```typescript
// Zustand store
import { create } from 'zustand';

interface PlayerStore {
  isPlaying: boolean;
  setPlaying: (playing: boolean) => void;
}

export const usePlayerStore = create<PlayerStore>((set) => ({
  isPlaying: false,
  setPlaying: (playing) => set({ isPlaying: playing }),
}));
```

### Components

- One component per file
- Name files after the component: `VideoCard.tsx`, `UploadModal.tsx`
- Co-locate hooks, types, and utilities with the components that use them
- Prefer composition over inheritance

## Mobile (packages/mobile)

### Framework: Expo + React Native

- Use Expo Router for navigation (`app/` directory)
- NativeWind for styling (Tailwind syntax in React Native)
- Use Expo SDK modules for device APIs (camera, secure storage, etc.)

### Performance

- Use `React.memo` for list items rendered in flat lists
- Minimize re-renders in video feeds; manage video lifecycle carefully
- Use `expo-image` for optimized image loading

## Shared Code (packages/shared)

- Only put code here if it is used by **two or more** packages
- Export types, constants, utility functions, and Zod schemas
- Keep this package dependency-free (no Node.js or browser-specific APIs)

## Naming Conventions

| Item | Convention | Example |
|---|---|---|
| Files (components) | PascalCase | `VideoCard.tsx` |
| Files (modules) | kebab-case | `video-service.ts` |
| Files (routes) | kebab-case | `video-extended.ts` |
| Variables & functions | camelCase | `getVideoById` |
| Types & interfaces | PascalCase | `VideoMetadata` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_UPLOAD_SIZE` |
| Database tables | snake_case | `user_videos` |
| API endpoints | kebab-case | `/api/video-reactions` |
| Environment variables | SCREAMING_SNAKE_CASE | `DATABASE_URL` |
| CSS classes | Tailwind utilities | `text-sm font-medium` |

## API Design

- RESTful endpoints with consistent response shapes
- Use `GET` for reads, `POST` for creates, `PUT`/`PATCH` for updates, `DELETE` for deletes
- Paginate list endpoints with `limit` and `cursor` parameters
- Return consistent JSON envelopes:

```json
{
  "data": { ... },
  "meta": { "cursor": "abc123", "hasMore": true }
}
```

Error responses:

```json
{
  "error": {
    "code": "VIDEO_NOT_FOUND",
    "message": "The requested video does not exist"
  }
}
```

## Git

- Keep commits atomic and focused on a single change
- Use conventional commit messages (see [CONTRIBUTING.md](CONTRIBUTING.md#commit-messages))
- Squash-merge feature branches into `main`
- Never commit `.env` files, credentials, or secrets

## Security

- Validate and sanitize all user input at the API boundary
- Use parameterized queries (Drizzle handles this)
- Store secrets in environment variables, never in code
- Use `bcryptjs` for password hashing and `jose` for JWT operations
- Follow the encryption patterns in `Markdowns/ENCRYPTION_IMPLEMENTATION.md`
- Apply rate limiting on public endpoints
