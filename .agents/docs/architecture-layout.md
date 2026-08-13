# Architecture Layout

## 1. Project layout (HARD rule)

Backing principles: [R2](#r2), [R3](#r3), [R1](#r1). The general "feature modules" rule recommends `src/<feature>/`; we use `src/core/<feature>/` (foundational features already here, e.g. auth) and `src/modules/<feature>/` (new business features) plus `src/infrastructure/<concern>/` to separate business features from shared plumbing. Apply this layout, not the flat one.

```
src/
  main.ts                       # bootstrap; tracing import MUST be first
  app.module.ts                 # imports feature modules; no providers/controllers here
  configs/                      # env config (zod), policies, swagger
  common/                       # cross-cutting utilities (crypto, pagination, utils)
  database/                     # prisma.service.ts, prisma.module.ts, generated client
  infrastructure/<concern>/     # observability, redis, queue, mailer, sms — shared plumbing
  core/<feature>/               # foundational features already here (auth, fcm-token, health)
  modules/<feature>/            # new business features go here
  locals/                       # localized message strings
```

Inside a feature folder (same shape under `src/core/<feature>/` and `src/modules/<feature>/`):

```
<feature>.module.ts
<feature>.controller.ts
services/         # one service per use-case; never a god-service
repositories/     # one repo per aggregate; returns Prisma types
dto/request/      # validated request DTOs
dto/response/     # serialized public response DTOs
strategies/       # passport strategies if applicable
guards/           # route guards
decorators/       # route/param decorators
types/            # shared types for this feature
```

- New business features go under `src/modules/`. Auth and the foundational features already present stay under `src/core/` — don't move them. Shared plumbing goes under `src/infrastructure/`.
- A feature module imports what it needs and only re-exports what other features actually consume (see `AuthModule` exports — it exports repositories so other modules can read auth data without duplicating providers).
- **Never** put providers or controllers directly in `app.module.ts`.

## 2. Imports & path aliases

- Use the path aliases from `tsconfig.json`:
  - `@/*` → `src/*`
  - `@prisma-client` → generated Prisma client
  - `@locals` → `src/locals`
- **Never** use deep relative imports (`../../../`). Use `@/...` instead.
- Use `import type` for type-only imports (DTOs, interfaces, Prisma types). Pattern:
  - `import type { Request } from 'express';`
  - `import type { Config } from '@/configs/environment.config';`
- Sort imports by source: node builtins → external packages → `@/...` aliases → relative. Prettier handles spacing, not order.

## 3. Naming & filenames

- Filenames are **kebab-case** with a category suffix:
  - `*.controller.ts`, `*.service.ts`, `*.module.ts`, `*.repository.ts`, `*.dto.ts`, `*.strategy.ts`, `*.guard.ts`, `*.decorator.ts`, `*.types.ts`, `*.policy.ts`, `*.processor.ts`, `*.interceptor.ts`, `*.config.ts`.
- Class names are PascalCase matching the filename: `login.service.ts` → `LoginService`.
- DTO classes end with `Dto` (`LoginDto`, `RegisterDto`). Each endpoint owns separate request and response DTO classes when those contracts are needed. Response DTOs live in separate files; tightly related request DTOs may share a file, but routes never reuse the same request DTO class.
- Constants live in `*.constants.ts` (SCREAMING_SNAKE_CASE or an `as const` object).
- Test files live next to the code as `*.spec.ts` (unit) or under `test/` as `*.e2e-spec.ts` (e2e).

## Architecture (CRITICAL)

### R1 — arch-avoid-circular-deps {#r1}

Circular module imports are the #1 cause of NestJS runtime crashes. Break them by extracting shared logic into a third module, or by using events.

```ts
// BAD: A ⇄ B
@Module({ imports: [OrdersModule], providers: [UsersService] })
export class UsersModule {}
@Module({ imports: [UsersModule], providers: [OrdersService] })
export class OrdersModule {}

// GOOD: extract to SharedModule, or use events
@Module({ providers: [SharedService], exports: [SharedService] })
export class SharedModule {}
```

### R2 — arch-feature-modules {#r2}

Organize by feature, not by technical layer. Each feature module is self-contained (controller, service, repo, DTOs).

```ts
// BAD: src/controllers/, src/services/, src/entities/
// GOOD:
// src/users/{users.module.ts, users.controller.ts, users.service.ts, dto/}
@Module({
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
  exports: [UsersService], // only what others need
})
export class UsersModule {}
```

### R3 — arch-module-sharing {#r3}

Modules are singletons by default. Providing the same service in two modules creates two instances with separate state. Encapsulate in a dedicated module and export.

```ts
// BAD: providers: [StorageService] in two modules → two singletons
// GOOD:
@Module({ providers: [StorageService], exports: [StorageService] })
export class StorageModule {}
@Module({ imports: [StorageModule] }) // imports the module, not the service
export class VideosModule {}
```

Use `@Global()` sparingly — only for truly cross-cutting concerns (config, logging, DB).

### R4 — arch-single-responsibility {#r4}

If a service name contains "And" or handles two domains, split it. God services tank testability ~40%.

```ts
// BAD: UserAndOrderService { createUser, createOrder, calculateStats, validatePayment }
// GOOD: UsersService, OrdersService, OrderStatsService — composed in a controller.
```

### R5 — arch-use-events {#r5}

Use `@nestjs/event-emitter` for intra-process events to decouple producers from consumers.

```ts
// BAD: OrdersService directly calls Inventory, Email, Analytics, Notification, Loyalty.
// GOOD:
this.eventEmitter.emit('order.created', new OrderCreatedEvent(...));
// each consumer listens with @OnEvent('order.created').
```

### R6 — arch-use-repository-pattern {#r6}

Complex queries belong in repositories, not services. Services hold business logic; repos hold data access.

```ts
// BAD: createQueryBuilder().leftJoin()...having() inside UsersService.
// GOOD:
@Injectable()
export class UsersRepository {
  constructor(@InjectRepository(User) private repo: Repository<User>) {}
  findActiveWithMinOrders(min: number) {
    /* QB here */
  }
}
@Injectable()
export class UsersService {
  constructor(private users: UsersRepository) {}
  getActiveUsers() {
    return this.users.findActiveWithMinOrders(1);
  }
}
```

## Dependency Injection (CRITICAL)
