# Testing

## 15. Testing

Backing principles: [R27](#r27), [R25](#r25), [R26](#r26), [R29](#r29).

- Unit tests use `Test.createTestingModule(...).compile()` from `@nestjs/testing`. Override providers with mocks via `.overrideProvider(...)`.
- Mock external services (Redis, mailers, SMS) — never hit the network in unit tests.
- Repository tests **may** hit a real test database (preferred over mocking Prisma); use a separate `DATABASE_URL` in test config.
- E2E tests in `test/` use Supertest against the full Nest application. Boot via `Test.createTestingModule({ imports: [AppModule] })`.




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


