# Database Repos

## 5. Repository pattern

Backing principles: [R6](#r6), [R30](#r30), [R28](#r28), [R23](#r23).

- Every Prisma table touched by business code has a repository in `repositories/`. See `credential.repository.ts` for the canonical shape:
  - `@Injectable()`, constructor-injects `PrismaService`.
  - Methods are thin: one Prisma call each. No business logic.
  - Return Prisma row types directly (`Promise<Credential | null>`). Don't invent DTOs at the repo layer.
  - Don't `await` if you're just returning the promise — return it directly.
- Input objects for create/update get a local `interface CreateXInput` exported from the repo file. Keep them minimal.
- For transactions spanning multiple writes, inject `PrismaService` into a coordinator service and use `this.prisma.$transaction([...])` — do **not** push the transaction client through every repo method.




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


