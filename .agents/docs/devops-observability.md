# Devops Observability

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


