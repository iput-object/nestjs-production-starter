# Api Controllers

## 6. DTOs & validation

Backing principles: [R31](#r31), [R33](#r33), [R20](#r20), [R18](#r18).

- Every controller input is a class with `class-validator` decorators. See `login.dto.ts`.
- Use `class-transformer` `@Transform` for normalization (trim, lowercase emails) — do it on the DTO, not in the service.
- Bang-properties (`email!: string;`) are fine because the global `ValidationPipe` guarantees presence.
- Global pipe is already configured in `main.ts` with `whitelist: true, forbidNonWhitelisted: true, transform: true`. **Don't** weaken those options at the controller level.
- Never accept raw `any` / `Record<string, unknown>` from a request. Write a DTO.

### Request DTOs

- Request DTOs live in `<feature>/dto/request/`. They describe untrusted input, end in `Dto`, and use `class-validator` for every accepted property.
- Each body-bearing endpoint owns one endpoint-specific request DTO class. Do not reuse one request DTO class across multiple routes, even when the current fields happen to match.
- Normalize input with `class-transformer` on the DTO. Do not normalize request fields in controllers or services.
- Do not reuse Prisma models, TypeScript interfaces, or response DTOs as request bodies.
- Optional TypeScript properties must also use `@IsOptional()`; optional syntax alone does not control runtime validation.

### Response DTOs

- Response DTOs live in `<feature>/dto/response/`. Each endpoint that returns data owns one endpoint-specific payload DTO in its own `<endpoint>.response.dto.ts` file.
- A feature response DTO describes only the value placed inside the envelope's `data` field. Never declare `data`, `success`, `message`, `statusCode`, `metadata`, or `pagination` on a feature response DTO.
- `TransformResponseInterceptor` owns the response envelope. Do not duplicate or manually model that envelope in every endpoint DTO.
- Message-only endpoints use a built-in Swagger success decorator without a fake empty payload DTO.
- Put `@Exclude()` on the class and `@Expose()` on every public field.
- Response DTOs are pure shape declarations by default. Do not add a constructor, presenter, mapper, or `static from()` when source and response fields already match.
- Map ordinary objects inline with `plainToInstance(ResponseDto, value, { excludeExtraneousValues: true })` at the point they are returned.
- `plainToInstance()` accepts arrays directly. Do not add a `.map()` solely to construct ordinary DTO instances.
- Never return a Prisma row from a controller. Response DTOs must omit secrets and internal ownership, audit, deletion, and credential fields unless the endpoint contract explicitly requires them.
- Response DTOs do not use `class-validator`; validation is for untrusted request input.
- Use `@Type(() => ChildResponseDto)` for nested DTOs so `plainToInstance()` and the global `ClassSerializerInterceptor` recurse correctly. Each child follows these rules independently.
- `TransformResponseInterceptor` is the sole response-envelope binder. Return a DTO directly or place it in `ServiceResponse.data`; never construct `success`, `statusCode`, or a second envelope in a controller.
- `ClassSerializerInterceptor` is already registered globally through `APP_INTERCEPTOR` in `CommonModule`. Do not register it again in `main.ts`.
- Never add a global interceptor that selects or guesses a response DTO. A route must map its DTO explicitly so required custom logic cannot be silently skipped.

#### Field-local transformations

- Use `@Transform()` on the response field when formatting, masking, casing, trimming, or converting that field can be expressed as a synchronous, pure function of the raw source object.
- Keep the transform on the DTO and reusable pure helpers in a nearby utility such as `mask.util.ts`. Never put response masking or formatting in a controller or service.
- Use `{ toClassOnly: true }` when a transform converts the source type to a wire type, so serialization does not apply it twice.

#### Derived or complex mappings

- Add `static from()` only when a response value does not exist on the source or when conditionals spanning multiple fields would make one `@Transform()` unreadable.
- A `from()` factory must remain synchronous and pure. Use it explicitly for a single value and `.map()` it across arrays.
- Do not add `from()` preemptively. Its presence means the DTO has genuinely custom mapping behavior worth testing in isolation.

#### Async mapping inputs

- Neither `@Transform()` nor `from()` may perform I/O, dependency injection, or async work.
- Resolve lookups in the service first, then include the resolved value in the source passed to `plainToInstance()` or `from()`.

### Lightweight Swagger

- Every DTO field uses `@ApiProperty()` or `@ApiPropertyOptional()`. Optional request properties use `@ApiPropertyOptional()`.
- Keep decorator options minimal. Add only contract details that TypeScript cannot express in OpenAPI, such as `enum`, `nullable`, nested `type`, or array item type.
- Do not add examples or descriptions that merely restate the field name or its validators.
- Every route documents its payload with Nest Swagger's built-in `@ApiOkResponse()` or `@ApiCreatedResponse()`. Do not add a custom response decorator solely to model the global envelope.
- Message-only routes use the built-in response decorator without a `type`.
- Request schemas come from the class passed to `@Body()`; do not repeat them with `@ApiBody()` unless the request is polymorphic or otherwise not inferable.
- Every route uses `@ApiOperation({ summary })`. Add `description` only for behavior, side effects, transport rules, or security details that the summary and DTOs do not explain.

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
    return next
      .handle()
      .pipe(
        tap(() =>
          this.logger.log(`${req.method} ${req.url} ${Date.now() - start}ms`),
        ),
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
@Controller('users')
@Version('2')
class UsersV2Controller {}
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
