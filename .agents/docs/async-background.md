# Async Background

## 12. Async lifecycle

Backing principles: [R21](#r21), [R38](#r38).

- Services that own resources implement `OnModuleInit` / `OnModuleDestroy` (see `PrismaService`). Connect in `onModuleInit`, disconnect in `onModuleDestroy`.
- `app.enableShutdownHooks(['SIGINT', 'SIGTERM'])` is already on — that's what fires the destroy hooks. Don't add custom signal handlers.

## 13. Queues & background work

Backing principles: [R37](#r37), [R36](#r36), [R5](#r5), [R24](#r24).

- Background jobs use BullMQ via `@nestjs/bullmq` (see `infrastructure/mailer/mail.processor.ts`, `infrastructure/sms/sms.processor.ts`).
- The pattern: `Queued<X>Service` enqueues, `<X>.processor.ts` runs the job. Controllers/services call the queued variant; they never block on the work.
- Queue names live in `*.constants.ts`. Job payload types in `*.types.ts`.




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

Scheduled jobs: `queue.upsertJobScheduler('daily', { pattern: '0 0 * * *' }, { name: 'job-name' })`.

## DevOps & Deployment (LOW-MEDIUM)


