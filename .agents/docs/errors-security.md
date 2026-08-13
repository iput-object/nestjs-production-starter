# Errors Security

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


