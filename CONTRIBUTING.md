# Contributing to Exprsn

Thank you for your interest in contributing to Exprsn. This guide covers everything you need to get started.

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- pnpm 9.15.0 (`corepack enable && corepack prepare pnpm@9.15.0 --activate`)
- Docker and Docker Compose
- FFmpeg (for video processing features)
- Git

### Setting Up Your Development Environment

1. **Fork and clone** the repository:
   ```bash
   git clone https://github.com/your-username/exprsn.git
   cd exprsn
   ```

2. **Install dependencies:**
   ```bash
   pnpm install
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   ```

4. **Start infrastructure services:**
   ```bash
   pnpm docker:up
   ```

5. **Initialize the database:**
   ```bash
   pnpm db:push
   pnpm setup
   ```

6. **Start development servers:**
   ```bash
   pnpm dev
   ```

### Verifying Your Setup

- API: `http://localhost:3000`
- Web: `http://localhost:3001`
- MinIO Console: `http://localhost:9001` (minioadmin/minioadmin)
- Mailhog: `http://localhost:8025`

## Project Structure

This is a pnpm monorepo. Each package lives under `packages/`:

- **`packages/api`** - Backend API (Hono + Drizzle + BullMQ)
- **`packages/web`** - Web frontend (Next.js + Tailwind)
- **`packages/mobile`** - Mobile app (Expo + React Native)
- **`packages/shared`** - Shared types and utilities
- **`packages/lexicons`** - AT Protocol lexicon schemas
- **`packages/pds`** - Personal Data Server
- **`packages/relay`** - Federation relay
- **`packages/video-service`** - Video transcoding
- **`packages/render-worker`** - FFmpeg worker
- **`packages/feed-generator`** - AI feed generation
- **`packages/prefetch`** - Content prefetching
- **`packages/setup`** - Setup CLI

## Making Changes

### Branching Strategy

- Create feature branches from `main`
- Use descriptive branch names: `feature/video-reactions`, `fix/upload-timeout`, `refactor/auth-middleware`

### Development Workflow

1. Create a branch for your work:
   ```bash
   git checkout -b feature/your-feature
   ```

2. Make your changes. Run the relevant package in dev mode:
   ```bash
   # Run a specific package
   pnpm --filter @exprsn/api dev
   pnpm --filter @exprsn/web dev
   ```

3. Verify your changes:
   ```bash
   pnpm typecheck      # Type checking
   pnpm test           # Run tests
   pnpm format         # Auto-format code
   ```

4. Commit with a clear message (see [Commit Messages](#commit-messages)).

5. Push and open a pull request against `main`.

### Working with the Database

When modifying the database schema in `packages/api/src/db/schema.ts`:

```bash
pnpm db:generate    # Generate a migration file
pnpm db:migrate     # Apply the migration
```

For rapid iteration during development, `pnpm db:push` applies schema changes directly without generating migration files.

### Working with AT Protocol Lexicons

When adding or modifying lexicons in `packages/lexicons`:

```bash
pnpm lexicon:gen    # Regenerate TypeScript types from lexicon definitions
```

## Commit Messages

Use conventional commit format:

```
<type>: <short description>

<optional body with more detail>
```

**Types:**
- `feat` - New feature
- `fix` - Bug fix
- `refactor` - Code change that neither fixes a bug nor adds a feature
- `docs` - Documentation only
- `test` - Adding or updating tests
- `chore` - Tooling, dependencies, or build changes
- `perf` - Performance improvement

**Examples:**
```
feat: Add video reaction support with emoji picker
fix: Resolve upload timeout on large files
refactor: Extract auth middleware into shared package
docs: Update API endpoint reference
```

## Pull Requests

### Before Submitting

- [ ] Code passes `pnpm typecheck` with no errors
- [ ] Existing tests pass with `pnpm test`
- [ ] New features include tests where applicable
- [ ] Code is formatted with `pnpm format`
- [ ] Commit messages follow conventional format
- [ ] PR description explains what changed and why

### PR Description Template

```markdown
## Summary
Brief description of what this PR does.

## Changes
- Bullet list of specific changes

## Testing
How to test the changes:
1. Step-by-step instructions

## Screenshots
If applicable, include screenshots or recordings.
```

### Review Process

1. All PRs require at least one review before merging.
2. Address review feedback by pushing new commits (don't force-push during review).
3. PRs are squash-merged into `main`.

## Testing

### API Tests

```bash
cd packages/api
pnpm test              # Run all tests
pnpm test:watch        # Watch mode
pnpm test:coverage     # With coverage report
```

Tests use Vitest. Place test files in `src/__tests__/` or co-located as `*.test.ts` files.

### Web E2E Tests

```bash
cd packages/web
pnpm test:e2e          # Run Playwright tests
pnpm test:e2e:ui       # Interactive UI mode
pnpm test:e2e:headed   # Run in visible browser
```

## Code Style

See [STYLEGUIDE.md](STYLEGUIDE.md) for the full style guide. Key points:

- TypeScript strict mode is enforced
- Prettier handles formatting (2-space indent, single quotes, trailing commas)
- Use Zod for runtime validation at API boundaries
- Use Drizzle ORM for all database queries
- Follow existing patterns in each package

## Reporting Issues

When reporting bugs, include:

1. Steps to reproduce
2. Expected behavior
3. Actual behavior
4. Environment details (OS, Node version, browser)
5. Relevant logs or error messages

## Code of Conduct

Be respectful, inclusive, and constructive. We are building a platform for creative expression, and our community should reflect those values.

## Questions?

- Check existing [documentation](Markdowns/) for architecture and implementation details
- Open a GitHub issue for bugs or feature requests
- Start a discussion for general questions
