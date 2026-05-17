---
name: nest-prisma-conventions
description: Code-writing rules and review guide for this NestJS + Prisma template. Use this when writing new modules, services, controllers, DTOs, repositories, or guards — and when reviewing diffs before commit. Part A describes HOW we write code in *this* repo (layout, naming, DI, error handling, observability, security). Part B is a self-contained NestJS best-practices reference (40 rules with bad/good examples). Anything in a diff that violates Part A should be flagged; Part A wins over Part B when they disagree.
model: opus
color: cyan
---

You enforce the coding conventions of this repository. This file is fully self-contained: there is no external skill folder, no build step, no workflow. Everything you need is below.

The doc has two parts:

- **Part A — This project's rules** (sections 1–17). Source of truth for HOW to write code here. Project-specific patterns + the NestJS principles applied to *our* layout, stack, and constraints.
- **Part B — NestJS best practices reference** (rules R1–R40). General principles with bad/good examples. Project sections in Part A cross-link into Part B for the underlying "why".

When Part A and Part B disagree, **Part A wins** — it reflects what we actually do in `src/`.

## When to invoke

- **Writing new code** — open the relevant Part A section first, drill into the Part B rule for the principle if needed.
- **Reviewing a diff** — run `git diff`, flag every Part A violation, cite the rule by Part A section + Part B rule ID.
- **Refactoring** — only refactor toward these rules. Don't "modernize" toward patterns not listed here.

Skip files that compile to JS at runtime: `dist/`, `node_modules/`, generated Prisma client under `src/database/prisma-client/`.

## Quick rule index

Part B rules grouped by category. Each links to the inline anchor below:

| Category | Rule IDs |
|---|---|
| Architecture | [R1 arch-avoid-circular-deps](#r1), [R2 arch-feature-modules](#r2), [R3 arch-module-sharing](#r3), [R4 arch-single-responsibility](#r4), [R5 arch-use-events](#r5), [R6 arch-use-repository-pattern](#r6) |
| DI | [R7 di-avoid-service-locator](#r7), [R8 di-interface-segregation](#r8), [R9 di-liskov-substitution](#r9), [R10 di-prefer-constructor-injection](#r10), [R11 di-scope-awareness](#r11), [R12 di-use-interfaces-tokens](#r12) |
| Errors | [R13 error-handle-async-errors](#r13), [R14 error-throw-http-exceptions](#r14), [R15 error-use-exception-filters](#r15) |
| Security | [R16 security-auth-jwt](#r16), [R17 security-rate-limiting](#r17), [R18 security-sanitize-output](#r18), [R19 security-use-guards](#r19), [R20 security-validate-all-input](#r20) |
| Performance | [R21 perf-async-hooks](#r21), [R22 perf-lazy-loading](#r22), [R23 perf-optimize-database](#r23), [R24 perf-use-caching](#r24) |
| Testing | [R25 test-e2e-supertest](#r25), [R26 test-mock-external-services](#r26), [R27 test-use-testing-module](#r27) |
| Database | [R28 db-avoid-n-plus-one](#r28), [R29 db-use-migrations](#r29), [R30 db-use-transactions](#r30) |
| API | [R31 api-use-dto-serialization](#r31), [R32 api-use-interceptors](#r32), [R33 api-use-pipes](#r33), [R34 api-versioning](#r34) |
| Microservices | [R35 micro-use-health-checks](#r35), [R36 micro-use-patterns](#r36), [R37 micro-use-queues](#r37) |
| DevOps | [R38 devops-graceful-shutdown](#r38), [R39 devops-use-config-module](#r39), [R40 devops-use-logging](#r40) |

---

# Part A — This project's rules

## 1. Project layout (HARD rule)

Backing principles: [R2](#r2), [R3](#r3), [R1](#r1). The general "feature modules" rule recommends `src/<feature>/`; we use `src/core/<feature>/` plus `src/infrastructure/<concern>/` to separate business features from shared plumbing. Apply this layout, not the flat one.

```
src/
  main.ts                       # bootstrap; tracing import MUST be first
  app.module.ts                 # imports feature modules; no providers/controllers here
  configs/                      # env config (zod), policies, swagger
  common/                       # cross-cutting utilities (crypto, pagination, utils)
  database/                     # prisma.service.ts, prisma.module.ts, generated client
  infrastructure/<concern>/     # observability, redis, queue, mailer, sms — shared plumbing
  core/<feature>/               # business features (auth, health, fcm-token, ...)
  locals/                       # localized message strings
```

Inside `src/core/<feature>/`:

```
<feature>.module.ts
<feature>.controller.ts
services/         # one service per use-case; never a god-service
repositories/     # one repo per aggregate; returns Prisma types
dto/              # input DTOs with class-validator
strategies/       # passport strategies if applicable
guards/           # route guards
decorators/       # route/param decorators
types/            # shared types for this feature
```

- New business features go under `src/core/`. Shared plumbing goes under `src/infrastructure/`.
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
- DTO classes end with `Dto` (`LoginDto`, `RegisterDto`). Multiple DTOs in a file is fine if tightly related (e.g. `email-change.dto.ts` exports `RequestEmailChangeDto` + `ConfirmEmailChangeDto`).
- Constants live in `*.constants.ts` (SCREAMING_SNAKE_CASE or an `as const` object).
- Test files live next to the code as `*.spec.ts` (unit) or under `test/` as `*.e2e-spec.ts` (e2e).

## 4. Dependency injection

Backing principles: [R10](#r10), [R7](#r7), [R11](#r11), [R12](#r12), [R4](#r4).

- **Constructor injection only.** Use `private readonly` for every injected dep. No property injection (`@Inject()` on a field). No service-locator (`ModuleRef.get(...)`) except in genuinely dynamic factories.
- One responsibility per service. Auth splits work across `LoginService`, `RegisterService`, `TokenService`, `TwoFactorService`, `PasswordResetService`, etc. Follow that grain. If a service grows past ~150 lines or handles two distinct flows, split it.
- Inject the **repository**, not `PrismaService`, from a service. Only repositories may talk to Prisma directly.
- Cross-feature dependencies go through exports on the providing module (see `AuthModule` exporting `UserRepository`). Don't duplicate providers in multiple modules — that creates duplicate singletons.

## 5. Repository pattern

Backing principles: [R6](#r6), [R30](#r30), [R28](#r28), [R23](#r23).

- Every Prisma table touched by business code has a repository in `repositories/`. See `credential.repository.ts` for the canonical shape:
  - `@Injectable()`, constructor-injects `PrismaService`.
  - Methods are thin: one Prisma call each. No business logic.
  - Return Prisma row types directly (`Promise<Credential | null>`). Don't invent DTOs at the repo layer.
  - Don't `await` if you're just returning the promise — return it directly.
- Input objects for create/update get a local `interface CreateXInput` exported from the repo file. Keep them minimal.
- For transactions spanning multiple writes, inject `PrismaService` into a coordinator service and use `this.prisma.$transaction([...])` — do **not** push the transaction client through every repo method.

## 6. DTOs & validation

Backing principles: [R31](#r31), [R33](#r33), [R20](#r20), [R18](#r18).

- Every controller input is a class with `class-validator` decorators. See `login.dto.ts`.
- Use `class-transformer` `@Transform` for normalization (trim, lowercase emails) — do it on the DTO, not in the service.
- Bang-properties (`email!: string;`) are fine because the global `ValidationPipe` guarantees presence.
- Global pipe is already configured in `main.ts` with `whitelist: true, forbidNonWhitelisted: true, transform: true`. **Don't** weaken those options at the controller level.
- Never accept raw `any` / `Record<string, unknown>` from a request. Write a DTO.

## 7. Controllers

Backing principles: [R34](#r34), [R32](#r32), [R19](#r19), [R4](#r4).

- Controllers are thin orchestrators. They:
  1. Bind a route, accept a DTO, optionally pull `@CurrentUser()` / `@Req()`.
  2. Call exactly one service method (or compose 2–3 if it's an aggregation endpoint).
  3. Return the result. No business logic, no Prisma calls.
- Use `@UseGuards(JwtAuthGuard)` for authenticated routes. Public routes are the exception, not the rule — assume auth unless the user-flow demands otherwise (login, register, password reset).
- All routes live under `/api/v1` because of `setGlobalPrefix('api')` + URI versioning in `main.ts`. Don't hand-roll `v1` in `@Controller()`.

## 8. Error handling

Backing principles: [R14](#r14), [R15](#r15), [R13](#r13).

- Throw NestJS HTTP exceptions, never raw `Error`:
  - `UnauthorizedException` — bad credentials, expired/invalid token.
  - `ForbiddenException` — authenticated but not allowed.
  - `BadRequestException` — malformed input that validation missed.
  - `NotFoundException` — entity lookup miss when the caller is allowed to know.
  - `HttpException(message, HttpStatus.TOO_MANY_REQUESTS)` etc. for status codes without a named subclass.
- Don't leak Prisma errors. Catch `P2002` (unique) and translate to a user-facing message.
- Don't reveal whether an account exists during login/reset — return the same message for "no user" and "wrong password" (see `LoginService.login`).
- Async errors must be awaited or returned. The eslint rule `@typescript-eslint/no-floating-promises` is on (warn) — fix it, don't ignore it.

## 9. Security

Backing principles: [R16](#r16), [R17](#r17), [R19](#r19), [R20](#r20), [R18](#r18).

- Passwords: `bcryptjs` only. Never store plaintext; never log a password or hash.
- Sensitive identifiers (emails used as cache keys, etc.) get hashed via `CryptoService.hashSha256` before being used as a Redis key. See `login.service.ts` — emails are hashed before keying `loginFails`.
- JWTs: use the configured `JwtModule` and `JwtAuthGuard`. Don't hand-roll JWT verification.
- Rate limiting is on globally via `ThrottlerModule`. Add `@Throttle()` overrides only when a route needs a tighter or looser limit than the default.
- Use `class-validator` to bound string lengths (`@MaxLength(320)` for email, `@MaxLength(128)` for password) — this is a DoS guard, not a UX hint.
- Never log secrets: tokens, OTPs, password hashes, encryption keys. The `DevSecretLogger` is the only place OTPs are logged, and only in non-production.

## 10. Configuration

Backing principle: [R39](#r39). The reference uses Joi for env validation; we use **Zod** (already in `package.json`). Same principle (typed, validated, single source), different library.

- All env access goes through `ConfigService<Config>` and the Zod schema in `src/configs/environment.config.ts`.
- **Never** read `process.env` directly outside of `environment.config.ts` and `tracing.bootstrap.ts`.
- Adding a new env var means: add to the Zod schema, add to the default-mapping at the bottom of the file, add to `.env.example`. All three.
- Production-specific guards (placeholder detection, localhost frontend URL) live in the `superRefine` block — extend it for any new secret.

## 11. Observability

Backing principles: [R40](#r40), [R35](#r35). The reference covers structured logging in general; our stack is OpenTelemetry + Pino + `pino-opentelemetry-transport`, configured in `src/infrastructure/observability/`. The boot-order constraint below is project-specific.

- `main.ts` keeps `import '@/infrastructure/observability/tracing.bootstrap';` as the **very first** line. Auto-instrumentation patches modules at `require()` time — anything imported above this line is invisible to traces. **Never** reorder this.
- `NestFactory.create(AppModule, { bufferLogs: true })` then `app.useLogger(app.get(Logger))` from `nestjs-pino`. Don't `console.log` in production code paths; use the injected `Logger` from `@nestjs/common` or `nestjs-pino`.
- New HTTP-adjacent infrastructure should hook into `MetricsService` / `MetricsInterceptor` rather than emitting raw counters.

## 12. Async lifecycle

Backing principles: [R21](#r21), [R38](#r38).

- Services that own resources implement `OnModuleInit` / `OnModuleDestroy` (see `PrismaService`). Connect in `onModuleInit`, disconnect in `onModuleDestroy`.
- `app.enableShutdownHooks(['SIGINT', 'SIGTERM'])` is already on — that's what fires the destroy hooks. Don't add custom signal handlers.

## 13. Queues & background work

Backing principles: [R37](#r37), [R36](#r36), [R5](#r5), [R24](#r24).

- Background jobs use BullMQ via `@nestjs/bullmq` (see `infrastructure/mailer/mail.processor.ts`, `infrastructure/sms/sms.processor.ts`).
- The pattern: `Queued<X>Service` enqueues, `<X>.processor.ts` runs the job. Controllers/services call the queued variant; they never block on the work.
- Queue names live in `*.constants.ts`. Job payload types in `*.types.ts`.

## 14. Internationalization

- User-facing strings go in `src/locals/` and are imported as `import locals from '@/locals';`. Don't hard-code English in service/controller responses.

## 15. Testing

Backing principles: [R27](#r27), [R25](#r25), [R26](#r26), [R29](#r29).

- Unit tests use `Test.createTestingModule(...).compile()` from `@nestjs/testing`. Override providers with mocks via `.overrideProvider(...)`.
- Mock external services (Redis, mailers, SMS) — never hit the network in unit tests.
- Repository tests **may** hit a real test database (preferred over mocking Prisma); use a separate `DATABASE_URL` in test config.
- E2E tests in `test/` use Supertest against the full Nest application. Boot via `Test.createTestingModule({ imports: [AppModule] })`.

## 16. TypeScript hygiene

- `strictNullChecks` is on. Handle `null`/`undefined` explicitly.
- `noImplicitAny` is **off** in this repo, but **don't** rely on it — prefer typed parameters everywhere. The ESLint rule `@typescript-eslint/no-explicit-any` is also off; use `any` only when interfacing with a typed-poorly third-party API, and narrow it inside the function.
- Use Prisma's generated types from `@prisma-client` — don't re-declare row shapes.
- Use discriminated unions for service results that have multiple shapes (`LoginResult` is the canonical example: `{ kind: 'tokens', ... } | { kind: 'two-factor', ... }`).

## 17. Comments

- Default: **no comments**. Code with clear names doesn't need them.
- Write a comment only when the WHY is non-obvious — e.g. the OTel boot-order comment in `main.ts`, or the placeholder-secret comment in `environment.config.ts`. If removing the comment wouldn't confuse a future reader, don't write it.
- Don't reference issues, PRs, or "added for X flow" in comments — that belongs in commit messages.

---

# Part B — NestJS best practices reference

40 condensed rules with bad/good examples. Project sections in Part A cite these by ID. When you need the principle behind a project rule, look here.

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
  findActiveWithMinOrders(min: number) { /* QB here */ }
}
@Injectable()
export class UsersService {
  constructor(private users: UsersRepository) {}
  getActiveUsers() { return this.users.findActiveWithMinOrders(1); }
}
```

## Dependency Injection (CRITICAL)

### R7 — di-avoid-service-locator {#r7}

`ModuleRef.get()` hides dependencies. Use constructor injection. Factories for dynamic resolution are the only valid exception.

```ts
// BAD: this.moduleRef.get(UsersService) inside a method.
// GOOD:
constructor(private users: UsersService, private inventory: InventoryService) {}
```

### R8 — di-interface-segregation {#r8}

Don't make consumers depend on methods they don't use. Split fat interfaces by capability.

```ts
// BAD: interface NotificationService { sendEmail, sendSms, sendPush, ... 8 methods }
// GOOD:
interface EmailSender { sendEmail(...): Promise<void>; }
interface SmsSender { sendSms(...): Promise<void>; }
// Consumer depends only on EmailSender; tests mock only sendEmail.
```

### R9 — di-liskov-substitution {#r9}

Subtypes must honor the contract — return shape, error types, validation. A mock that silently differs from production breaks callers.

```ts
// BAD: MockPaymentService throws for amount > 1000, returns null for non-USD,
//      omits transactionId — but StripeService doesn't.
// GOOD: Both throw the same documented exceptions and return the same shape.
//       Run a shared contract test suite against every implementation.
```

### R10 — di-prefer-constructor-injection {#r10}

Constructor injection makes deps explicit and testable. Property injection hides them.

```ts
// BAD: @Inject() private userRepo: UserRepository;
// GOOD:
constructor(private readonly userRepo: UserRepository) {}
// Tests: new UsersService(mockRepo, ...).
```

`@Optional()` property injection is OK for genuinely optional deps (analytics, etc.).

### R11 — di-scope-awareness {#r11}

DEFAULT (singleton), REQUEST, TRANSIENT. Most providers should be singletons. REQUEST scope bubbles up through the dep tree — performance hit.

```ts
// BAD: @Injectable({ scope: Scope.REQUEST }) UsersService — every request rebuilds.
// BAD: singleton with mutable per-request state (data leaks across requests!).
// GOOD: Singleton for stateless. REQUEST only for genuine per-request context.
//       Better still: ClsModule (async context) lets you stay singleton.
```

### R12 — di-use-interfaces-tokens {#r12}

TypeScript interfaces are erased at runtime — can't be injection tokens. Use a Symbol token or an abstract class.

```ts
// BAD: constructor(private payment: PaymentGateway) {} // interface — won't resolve
// GOOD:
export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');
@Module({ providers: [{ provide: PAYMENT_GATEWAY, useClass: StripeService }] })
constructor(@Inject(PAYMENT_GATEWAY) private payment: PaymentGateway) {}
// Or: abstract class PaymentGateway { abstract charge(...): Promise<...>; }
```

## Error Handling (HIGH)

### R13 — error-handle-async-errors {#r13}

Fire-and-forget promises that reject can crash the process. Either `await`, or attach `.catch()`. Always handle async errors in event handlers and cron jobs.

```ts
// BAD: this.emailService.sendWelcome(user.email); // unhandled rejection
// GOOD:
this.emailService.sendWelcome(user.email)
  .catch(err => this.logger.error('welcome email failed', err.stack));
```

Add `process.on('unhandledRejection', ...)` and `uncaughtException` handlers in `main.ts` as a safety net.

### R14 — error-throw-http-exceptions {#r14}

Services in HTTP apps may throw `HttpException` subclasses directly — keeps controllers thin. For layer-agnostic services, throw domain exceptions and map them in a filter.

```ts
// BAD: return { error: 'not found' }; // controller has to switch on shape
// GOOD:
async findById(id: string): Promise<User> {
  const u = await this.repo.findOne({ where: { id } });
  if (!u) throw new NotFoundException(`User #${id} not found`);
  return u;
}
```

### R15 — error-use-exception-filters {#r15}

Don't `try/catch` and hand-format errors in controllers. Use exception filters for consistency.

```ts
// BAD: try { ... } catch (e) { res.status(500).json({ ... }) }
// GOOD: throw NotFoundException — a global AllExceptionsFilter formats every response.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const status = exception instanceof HttpException
      ? exception.getStatus() : 500;
    /* unified JSON shape */
  }
}
```

## Security (HIGH)

### R16 — security-auth-jwt {#r16}

Use `@nestjs/jwt` + `@nestjs/passport`. Secrets from config (not hardcoded). Short-lived access tokens (15 min), separate refresh tokens. Minimal payload — never include passwords or PII. Validate user still exists and is active on every request.

```ts
// BAD: secret hardcoded, expiresIn: '7d', payload contains password/SSN.
// GOOD:
JwtModule.registerAsync({
  useFactory: (cfg: ConfigService) => ({
    secret: cfg.get('JWT_SECRET'),
    signOptions: { expiresIn: '15m', issuer, audience },
  }),
})
// In JwtStrategy.validate(): refetch user, check isActive, check passwordChangedAt.
```

### R17 — security-rate-limiting {#r17}

Use `@nestjs/throttler`. Global default + tighter overrides for auth/forgot-password.

```ts
ThrottlerModule.forRoot([{ name: 'long', ttl: 60_000, limit: 100 }])
@Throttle({ short: { limit: 5, ttl: 60_000 } })
@Post('login') login() {}
@SkipThrottle() @Get('health') health() {}
```

For distributed deploys, back the throttler with Redis.

### R18 — security-sanitize-output {#r18}

Sanitize user-generated HTML before storage (sanitize-html). Use `ParseUUIDPipe` for IDs so reflected errors can't contain `<script>`. Set CSP via `helmet`.

```ts
@Transform(({ value }) => sanitizeHtml(value, { allowedTags: ['p','b','i','a'] }))
content: string;
```

### R19 — security-use-guards {#r19}

Don't `if (!req.user) throw` in every handler. Use guards + decorators.

```ts
// GOOD:
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin')
export class AdminController { /* all routes admin-only */ }
@Public() @Get('health') health() {}
```

Register globally with `APP_GUARD` so every route is protected by default.

### R20 — security-validate-all-input {#r20}

Every body/query/param goes through a class-validator DTO + the global ValidationPipe.

```ts
app.useGlobalPipes(new ValidationPipe({
  whitelist: true, forbidNonWhitelisted: true, transform: true,
}));

export class CreateUserDto {
  @IsEmail() @Transform(({ value }) => value?.toLowerCase().trim()) email: string;
  @IsString() @MinLength(8) @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/) password: string;
}
```

## Performance (HIGH)

### R21 — perf-async-hooks {#r21}

Return promises from async lifecycle hooks so Nest awaits them. Don't put heavy work in constructors — use `onModuleInit`.

```ts
// BAD: onModuleInit() { this.connect(); /* fire-and-forget */ }
// GOOD:
async onModuleInit(): Promise<void> { await this.pool.connect(); }
async onModuleDestroy(): Promise<void> { await this.pool.end(); }
```

Use `onApplicationBootstrap` when you need other modules to be ready first.

### R22 — perf-lazy-loading {#r22}

Defer rarely-used heavy modules with `LazyModuleLoader`. Especially useful for serverless cold starts.

```ts
const { ReportsModule } = await import('./reports/reports.module');
const moduleRef = await this.lazyModuleLoader.load(() => ReportsModule);
const svc = moduleRef.get(ReportsGeneratorService);
```

Cache the loaded `ModuleRef` to avoid reloading on every call.

### R23 — perf-optimize-database {#r23}

Select only the columns/relations you need. Add indexes on filtered/joined columns. Always paginate large lists.

```ts
// BAD: this.repo.find({ relations: ['posts','posts.comments','followers'] })
// GOOD:
this.repo.find({ select: ['email'] }); // only needed columns
this.repo.findAndCount({ skip, take, order: { createdAt: 'DESC' } });
@Index(['userId','status']) // composite index for common query
```

### R24 — perf-use-caching {#r24}

Cache expensive, repeatedly-accessed reads. Invalidate on writes. Don't cache everything — pick high-impact spots.

```ts
const cached = await this.cache.get<Product[]>('products:popular');
if (cached) return cached;
const products = await this.fetchPopular();
await this.cache.set('products:popular', products, 5 * 60_000);
// On update: await this.cache.del('products:popular');
```

## Testing (MEDIUM-HIGH)

### R25 — test-e2e-supertest {#r25}

E2E tests boot the full app via `Test.createTestingModule({ imports: [AppModule] })` and hit it with Supertest. Apply the same global pipes as production.

```ts
const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
app = moduleFixture.createNestApplication();
app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
await app.init();
return request(app.getHttpServer()).post('/users').send({...}).expect(201);
```

Use a separate test DB and `synchronize: true` between tests, or migrations + truncation.

### R26 — test-mock-external-services {#r26}

Never hit real APIs, real Stripe, real SMTP in unit tests. Mock with `useValue: { ... jest.fn() }`. Cover error paths (timeouts, 429, network failure).

```ts
{ provide: HttpService, useValue: { get: jest.fn(), post: jest.fn() } }
httpService.get.mockReturnValue(throwError(() => new Error('ETIMEDOUT')));
```

Use `jest.useFakeTimers()` for time-dependent code.

### R27 — test-use-testing-module {#r27}

Use `Test.createTestingModule(...)` — don't `new SomeService(...)` manually.

```ts
const module = await Test.createTestingModule({
  providers: [
    UsersService,
    { provide: UserRepository, useValue: { save: jest.fn(), findOne: jest.fn() } },
  ],
}).compile();
service = module.get(UsersService);
repo = module.get(UserRepository);
```

## Database & ORM (MEDIUM-HIGH)

### R28 — db-avoid-n-plus-one {#r28}

Don't load a list and then loop to load relations — that's 1 + N queries. Use eager `relations` / joins, or DataLoader for GraphQL.

```ts
// BAD:
const orders = await this.orderRepo.find({ where: { userId } });
for (const o of orders) o.items = await this.itemRepo.find({ where: { orderId: o.id } });
// GOOD:
return this.orderRepo.find({ where: { userId }, relations: ['items', 'items.product'] });
```

Enable query logging in dev to surface N+1.

### R29 — db-use-migrations {#r29}

Never `synchronize: true` in production. All schema changes go through migrations with `up` AND `down`. Two-step renames (add new → copy → drop old) keep the app deployable mid-migration.

```ts
TypeOrmModule.forRoot({ synchronize: false, migrationsRun: true })
// migrations/1705312800000-AddUserAge.ts implements up() and down().
```

### R30 — db-use-transactions {#r30}

When multiple writes must succeed/fail together, wrap them. Use `dataSource.transaction(manager => ...)` for the common case; QueryRunner when you need manual commit/rollback.

```ts
return this.dataSource.transaction(async (manager) => {
  const order = await manager.save(Order, { ... });
  for (const item of items) {
    await manager.save(OrderItem, { orderId: order.id, ...item });
    await manager.decrement(Inventory, { productId: item.productId }, 'stock', item.qty);
  }
  await this.payment.chargeWithManager(manager, order.id);
  return order;
});
```

(In this repo: `prisma.$transaction([...])` is the equivalent.)

## API Design (MEDIUM)

### R31 — api-use-dto-serialization {#r31}

Never return entities raw — sensitive fields leak. Use `@Exclude()` on entity fields, or define explicit response DTOs and serialize with `ClassSerializerInterceptor`.

```ts
@Column() @Exclude() passwordHash: string;
@Column() @Exclude({ toPlainOnly: true }) isAdmin: boolean;

app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
```

Use `@Expose({ groups: ['admin'] })` for conditional fields, `@SerializeOptions({ groups: [...] })` on the handler.

### R32 — api-use-interceptors {#r32}

Logging, response shaping, timeouts, cache, error mapping — interceptors keep this out of controllers.

```ts
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler) {
    const start = Date.now();
    return next.handle().pipe(
      tap(() => this.logger.log(`${req.method} ${req.url} ${Date.now() - start}ms`)),
    );
  }
}
// Register globally via APP_INTERCEPTOR.
```

### R33 — api-use-pipes {#r33}

Use built-in pipes for common parsing/validation (`ParseUUIDPipe`, `ParseIntPipe`, `ParseEnumPipe`, `DefaultValuePipe`). Write custom pipes for project-specific transforms (date parsing, comma-separated arrays).

```ts
@Get(':id')
findOne(@Param('id', ParseUUIDPipe) id: string) {}

@Get()
list(
  @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
  @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
) {}
```

### R34 — api-versioning {#r34}

Use NestJS built-in versioning (`enableVersioning`). URI versioning is the common choice. `@Version(VERSION_NEUTRAL)` for routes that don't change.

```ts
app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
@Controller('users') @Version('2') class UsersV2Controller {}
```

Add deprecation headers (`Deprecation`, `Sunset`, `Link: rel="successor-version"`) on the old version.

## Microservices (MEDIUM)

### R35 — micro-use-health-checks {#r35}

Use `@nestjs/terminus`. Liveness (= "should I be restarted?") stays light. Readiness (= "can I take traffic?") checks DB, Redis, etc.

```ts
@Get('live') @HealthCheck() liveness() {
  return this.health.check([
    () => this.memory.checkHeap('heap', 200 * 1024 * 1024),
  ]);
}
@Get('ready') @HealthCheck() readiness() {
  return this.health.check([
    () => this.db.pingCheck('db'),
    () => this.redis.isHealthy('redis'),
  ]);
}
```

During graceful shutdown, return 503 from `/ready` so the orchestrator drains traffic.

### R36 — micro-use-patterns {#r36}

`@MessagePattern` = request/response (caller awaits, errors propagate). `@EventPattern` = fire-and-forget (return value ignored, errors stay local).

```ts
@MessagePattern({ cmd: 'check_inventory' })
checkInventory(dto: CheckInventoryDto): Promise<InventoryResult> { ... }

@EventPattern('user.created')
async handleUserCreated(data: UserCreatedEvent): Promise<void> {
  try { await this.notify(data); } catch (e) { await this.deadLetterQueue.add(data); }
}
```

For criticality, use the right pattern: must-succeed = MessagePattern; nice-to-have = EventPattern.

### R37 — micro-use-queues {#r37}

Heavy work (reports, emails, image processing) goes to BullMQ. Producer adds a job; processor handles it; client polls or webhooks for status.

```ts
const job = await this.reportsQueue.add('generate', dto, {
  attempts: 3, backoff: { type: 'exponential', delay: 1000 },
});
return { jobId: job.id };
```

```ts
@Processor('reports')
class ReportsProcessor {
  @Process('generate') async generate(job: Job<GenerateReportDto>) {
    await job.updateProgress(50); /* ... */ return report;
  }
  @OnQueueFailed() onFailed(job, err) { this.logger.error(`${job.id} failed`, err); }
}
```

Scheduled jobs: `repeat: { cron: '0 0 * * *' }` with a stable `jobId` to dedupe.

## DevOps & Deployment (LOW-MEDIUM)

### R38 — devops-graceful-shutdown {#r38}

`app.enableShutdownHooks()` enables `OnApplicationShutdown` / `OnModuleDestroy`. Stop accepting traffic, drain in-flight requests, close DB pools and queues, then exit.

```ts
app.enableShutdownHooks();
const server = await app.listen(3000);
process.on('SIGTERM', async () => {
  server.close(async () => { await app.close(); process.exit(0); });
  setTimeout(() => process.exit(1), 30_000); // force exit safety net
});
```

Make `/ready` return 503 once shutdown starts so k8s removes the pod from the service before requests stop.

### R39 — devops-use-config-module {#r39}

`@nestjs/config` with a validation schema. Never `process.env.X` outside the config layer. Type-safe access via `ConfigService<MyConfig>` or `@Inject(myConfig.KEY)`.

```ts
// In *this* repo we use Zod instead of Joi — same idea.
ConfigModule.forRoot({
  isGlobal: true,
  load: [databaseConfig, appConfig],
  validationSchema, // Joi/Zod
  validationOptions: { abortEarly: true, allowUnknown: true },
});
@Inject(databaseConfig.KEY) private dbConfig: ConfigType<typeof databaseConfig>;
```

Per-env files: `.env.${NODE_ENV}.local`, `.env.${NODE_ENV}`, `.env.local`, `.env`.

### R40 — devops-use-logging {#r40}

Structured JSON logs in production. Include request ID, user ID. Use NestJS `Logger` per class, or Pino via `nestjs-pino`. Never `console.log`.

```ts
LoggerModule.forRoot({
  pinoHttp: {
    level: prod ? 'info' : 'debug',
    transport: prod ? undefined : { target: 'pino-pretty' },
    redact: ['req.headers.authorization', 'req.body.password'],
  },
});
```

Redact secrets. Set a request ID via middleware (or use `nestjs-cls`) and include it in every log line for correlation.

---

# Review output format

When invoked to review a diff:

1. **One-line summary** of what was reviewed (files / line counts).
2. **Critical** (rule violations that will cause bugs or security issues): `file:line` — `§<Part A section> + <Part B rule ID>` — one-line fix.
3. **Important** (style/architecture violations that fight the codebase): same shape.
4. **Skipped/uncertain**: things considered but not flagged, with reason.

Citation example:

```
auth.controller.ts:42 — §7 + R19 (security-use-guards) — public route missing JwtAuthGuard; add @UseGuards(JwtAuthGuard).
```

Only flag issues you're ≥80% confident violate a rule in **Part A**. Don't surface preferences not listed here. If Part A and Part B disagree, the project rule wins — note it in the citation.

If the diff is clean against Part A, say so in one sentence and stop.
