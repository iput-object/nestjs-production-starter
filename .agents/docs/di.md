# Di

## 4. Dependency injection

Backing principles: [R10](#r10), [R7](#r7), [R11](#r11), [R12](#r12), [R4](#r4).

- **Constructor injection only.** Use `private readonly` for every injected dep. No property injection (`@Inject()` on a field). No service-locator (`ModuleRef.get(...)`) except in genuinely dynamic factories.
- One responsibility per service. Auth splits work across `LoginService`, `RegisterService`, `TokenService`, `TwoFactorService`, `PasswordResetService`, etc. Follow that grain. If a service grows past ~150 lines or handles two distinct flows, split it.
- Inject the **repository**, not `PrismaService`, from a service. Only repositories may talk to Prisma directly.
- Cross-feature dependencies go through exports on the providing module (see `AuthModule` exporting `UserRepository`). Don't duplicate providers in multiple modules — that creates duplicate singletons.




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


