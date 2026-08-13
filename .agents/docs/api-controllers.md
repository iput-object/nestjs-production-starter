# Api Controllers

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



## 18. File uploads & storage

Backing principles: [R41](#r41), [R4](#r4).

- Do not handle binary file uploads directly through the NestJS server. Instead, use presigned URLs (signature links).
- **Uploads:** Create an endpoint that generates and returns a presigned upload URL for the client to push the file directly to cloud storage (e.g., AWS S3). 
- **Downloads:** When serving private files, generate a presigned download URL instead of streaming the file bytes through the API.
- This keeps the Node.js event loop free of I/O blocking and saves server bandwidth.




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

### R41 — api-use-presigned-urls {#r41}

Never accept multipart file uploads directly through the Node.js server. Generate a presigned URL and let the client upload directly to storage (S3/GCS).

```ts
// BAD: @UseInterceptors(FileInterceptor('file')) uploadFile(@UploadedFile() file) { ... }
// GOOD:
@Post('upload-url')
async getUploadUrl(@Body() dto: GetUploadUrlDto) {
  const url = await this.s3.createPresignedPost(dto.filename);
  return { uploadUrl: url };
}
```

This keeps your API stateless, reduces bandwidth, and prevents the Node.js event loop from stalling on large binary streams. Do the same for private file downloads.

## Microservices (MEDIUM)


