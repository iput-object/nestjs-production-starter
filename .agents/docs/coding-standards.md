# Coding Standards

## 14. Internationalization (HARD rule)

- **Every** user-facing string MUST be localized. No literal English in a controller/service response, exception message, or anything else a client can read. If you add a new flow, you add its strings to `src/locals/` in the same change.
- Strings live in the relevant `src/locals/*.json` file (`auth.json`, `error.json`, etc.) and are read via `import locals from '@/locals';` (e.g. `locals.auth.password_reset_email_sent`). Never inline the English.
- Keys are `snake_case` and describe the outcome, not the implementation (`password_reset_email_sent`, not `sent_ok`). Group them by domain file.
- When you remove or rename a flow, remove or rename its now-orphaned keys in the same diff — don't leave dead strings behind.
- This applies to thrown exception messages too where they surface to the client. A bare `throw new BadRequestException('Invalid code')` should pull its text from `locals`, not hard-code it.



## 16. TypeScript hygiene

- `strictNullChecks` is on. Handle `null`/`undefined` explicitly.
- `noImplicitAny` is **off** in this repo, but **don't** rely on it — prefer typed parameters everywhere. The ESLint rule `@typescript-eslint/no-explicit-any` is also off; use `any` only when interfacing with a typed-poorly third-party API, and narrow it inside the function.
- Use Prisma's generated types from `@prisma-client` — don't re-declare row shapes.
- Use discriminated unions for service results that have multiple shapes (`LoginResult` is the canonical example: `{ kind: 'tokens', ... } | { kind: 'two-factor', ... }`).

## 17. Comments

- Default: **no comments**. Code with clear names doesn't need them.
- Write a comment only when the WHY is non-obvious — e.g. the OTel boot-order comment in `main.ts`, or the placeholder-secret comment in `environment.config.ts`. If removing the comment wouldn't confuse a future reader, don't write it.
- Don't reference issues, PRs, or "added for X flow" in comments — that belongs in commit messages.




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


