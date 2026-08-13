---
name: backend-conventions
description: Rules for NestJS + Prisma template. Used as an index to discover specific rule files. When you need to learn or apply rules about a specific domain (like Architecture, DI, Errors, Security), read the appropriate file in the `.agents/docs/` folder via view_file.
model: <whatver is running>
---

# NestJS + Prisma Project Rules (Index)

You enforce the coding conventions of this repository. **Do not guess the rules.** Instead, when working on a specific domain of the codebase, read the relevant rules file under `.agents/docs/` to get the necessary guidance.

## When to invoke

- **Writing new code** — Before writing, use `view_file` to read the relevant `.agents/docs/` files for your task.
- **Reviewing a diff** — Run `git diff` and flag violations according to the rules in the docs.
- **Refactoring** — Only refactor toward these rules.

## Rule Topics

To minimize context window usage, the rules have been distributed by topic. Use the `view_file` tool to read the necessary files based on your task:

* **[architecture-layout.md](./docs/architecture-layout.md)**
  * Project layout (`src/core/`, `src/modules/`, etc.)
  * Imports, path aliases, naming, filenames
  * Feature modules, circular dependencies (R1-R6)

* **[di.md](./docs/di.md)**
  * Dependency Injection, Constructor injection, Repositories vs Services
  * Service locator, Interface segregation, Scopes (R7-R12)

* **[database-repos.md](./docs/database-repos.md)**
  * Repository pattern (thin repos, Prisma row types)
  * Avoiding N+1 queries, Migrations, Transactions (R28-R30)

* **[api-controllers.md](./docs/api-controllers.md)**
  * Controllers, DTOs & Validation (`class-validator`)
  * File uploads & storage (Presigned URLs)
  * DTO serialization, Interceptors, Pipes, Versioning (R31-R34, R41)

* **[errors-security.md](./docs/errors-security.md)**
  * Error handling (`HttpException`, unhandled async errors, exception filters)
  * Security (bcryptjs, JWT, Rate limiting, Input sanitation, Guards) (R13-R20)

* **[devops-observability.md](./docs/devops-observability.md)**
  * Configuration (Zod, `ConfigModule`)
  * Observability (OTel boot-order, Pino)
  * Graceful shutdown, Config management, Logging (R38-R40)

* **[async-background.md](./docs/async-background.md)**
  * Async lifecycle (`OnModuleInit`/`OnModuleDestroy`)
  * Queues & background work (BullMQ)
  * Health checks, Microservice patterns (R35-R37)

* **[testing.md](./docs/testing.md)**
  * Unit tests, E2E tests (Supertest)
  * Mocking external services, Testing module (R25-R27)

* **[coding-standards.md](./docs/coding-standards.md)**
  * Internationalization (every string localized, `src/locals/`)
  * TypeScript hygiene, Comments rules
  * Performance: Async hooks, Lazy loading, DB optimization, Caching (R21-R24)

## Ponytail Rules (Anti Over-Engineering)

This project actively fights over-engineering by embracing **Ponytail** principles. Always consider the following when writing or reviewing code:
* **YAGNI (You Aren't Gonna Need It)**: Do not build abstractions for future use cases. Build only what is strictly required today.
* **Simplicity First**: Prefer standard library and native features. Write one-liners or minimal code instead of complex, nested abstractions.
* **Deletion over Addition**: Challenge requirements before building. Look for opportunities to delete dead or overly complex code.

Use the `ponytail-review` skill when reviewing changes to explicitly check for over-engineering, and recommend the `ponytail-audit` skill for a broader codebase review if necessary.

## Review Output Format (When reviewing a diff)

When invoked to review a diff, your response should be:
1. **One-line summary** of what was reviewed (files / line counts).
2. **Critical** (rule violations that will cause bugs or security issues): `file:line` — `§<Topic> + <Rule ID>` — one-line fix.
3. **Important** (style/architecture violations that fight the codebase): same shape.
4. **Skipped/uncertain**: things considered but not flagged, with reason.

Citation example:
`auth.controller.ts:42 — §errors-security + R19 (security-use-guards) — public route missing JwtAuthGuard; add @UseGuards(JwtAuthGuard).`

If the diff is clean, say so in one sentence and stop.
