# NestJS Production Starter

A robust, production-ready NestJS boilerplate designed for scaling backend services. It comes pre-configured with everything you need: PostgreSQL, Prisma, background jobs, JWT/2FA authentication, strict environment validation, and enterprise-grade observability.

## Features

- **Framework**: [NestJS](https://nestjs.com/) (v11) using TypeScript.
- **Database**: [Prisma ORM](https://www.prisma.io/) with PostgreSQL adapter (`@prisma/adapter-pg`).
- **Authentication**: Complete JWT-based auth flow (`@nestjs/passport`), including Two-Factor Authentication (OTP, QR Codes) and Google OAuth integration.
- **Validation**: Strict DTO validation with `class-validator` and `class-transformer`.
- **Environment Configuration**: Strongly typed environment variables using `zod` and `@nestjs/config`.
- **Observability**: Full [OpenTelemetry](https://opentelemetry.io/) auto-instrumentation for traces and metrics. Structured JSON logging via `nestjs-pino` with OpenTelemetry transport.
- **Background Jobs & Queues**: High-performance background queues using [BullMQ](https://docs.nestjs.com/techniques/queues) and Redis.
- **Multi-Instance Ready**: Designed for horizontal scaling. WebSockets use `RedisIoAdapter` to sync events across nodes, and BullMQ uses Redis to distribute jobs seamlessly.
- **Security**: Rate limiting (`@nestjs/throttler`) and secure HTTP headers (`helmet`).
- **Notifications**: Pre-configured abstractions for Mail (`nodemailer`) and SMS (`twilio`).
- **WebSockets**: Real-time communication ready with `@nestjs/platform-socket.io` and Redis adapter.
- **API Documentation**: Auto-generated OpenAPI (Swagger) specifications via `@nestjs/swagger`.
- **Testing**: Pre-configured for Unit Tests (Jest) and E2E Tests (Supertest).

## Project Architecture

This project strictly follows a feature-module architecture and separation of concerns:

```text
src/
  main.ts                       # App bootstrap & auto-instrumentation
  app.module.ts                 # Root module (imports feature modules)
  configs/                      # Env config (Zod), policies, Swagger
  common/                       # Cross-cutting utilities (crypto, pagination, etc.)
  database/                     # Prisma module and service
  infrastructure/               # Shared plumbing (observability, Redis, queues, mailer)
  core/                         # Foundational features (auth, health, fcm)
  modules/                      # Business feature modules (your new features go here)
  locals/                       # Localized strings for error messages & notifications
```

### Key Design Patterns

- **Repository Pattern**: All database calls go through `repositories/` returning Prisma types directly. Services handle business logic, not raw database queries.
- **Thin Controllers**: Controllers are strictly for routing. They bind a route, accept a validated DTO, call a service, and return a result.
- **Dependency Injection**: Strict use of Constructor Injection to maximize testability.
- **Global Error Handling**: Custom exception filters ensure all API errors have a unified, standard JSON response structure.

## Getting Started

### Prerequisites

- Node.js (>= 20)
- [pnpm](https://pnpm.io/) (preferred package manager)
- Docker & Docker Compose (for local services)

### Installation

1. **Install dependencies:**
```bash
pnpm install
```

2. **Setup Environment Variables:**
Copy `.env.example` to `.env` and fill in the required values.
```bash
cp .env.example .env
```

3. **Start Local Infrastructure:**
Spin up the required background services (PostgreSQL, Redis, etc.).
```bash
docker compose up -d
```

4. **Run Database Migrations:**
Since this is a clean starter template, no initial migrations are included. You must create the first migration yourself based on the existing Prisma schema:
```bash
pnpm prisma migrate dev --name init
```

### Running the Application

```bash
# Development mode
pnpm run start

# Watch mode (recommended for local dev)
pnpm run start:dev

# Production mode
pnpm run build
pnpm run start:prod
```

## Authentication (Cookies vs. Bearer Tokens)

This starter provides a highly flexible JWT strategy out of the box. It implements a "One door, two keys" approach for both receiving and issuing tokens.

### Receiving Tokens (Incoming Requests)
The `JwtStrategy` automatically extracts the access token from either:
1. **Authorization Header (Bearer Token)**: Ideal for mobile apps (`Authorization: Bearer <token>`).
2. **HTTP-Only Cookies**: Ideal for web frontends to protect against XSS attacks.

### Issuing Tokens (Login/Register Responses)
To tell the API *how* you want to receive your tokens after a successful login or registration, you use the **`X-Auth-Transport`** header:
- **`X-Auth-Transport: bearer`**: The API will return the access and refresh tokens directly in the JSON response body. (Use this for mobile apps).
- **Omit the header**: The API will automatically set the tokens securely in HTTP-Only cookies and return no tokens in the body. (Use this for web apps).

You do not need to configure separate endpoints for web and mobile clients; the API intelligently adapts based on the `X-Auth-Transport` header during login, and accepts both formats seamlessly on protected routes.

## API Documentation (Swagger)

This template automatically generates and serves OpenAPI specifications, **but only in non-production environments** (to keep your API secure in production).

- **Swagger UI**: Accessible at `http://localhost:3000/api/docs` while the server is running (when `NODE_ENV !== 'production'`).
- **Auto-Generated JSON**: Every time the application starts in development, it automatically saves the latest `swagger.json` file to the `docs/` folder in the project root. This makes it incredibly easy for anyone on your team to grab the spec to generate frontend API clients or import it directly into Postman/Insomnia.

## Observability (OpenTelemetry + Pino)

This template ships OpenTelemetry instrumentation out-of-the-box. Traces and metrics are exported via OTLP HTTP, and logs are emitted as structured JSON via Pino with the active OTel `trace_id` / `span_id` for perfect log-trace correlation.

- **Traces**: Auto-instrumentation covers HTTP, NestJS, Prisma, Redis, and PostgreSQL.
- **Logs**: In production, logs go to stdout (JSON) and directly to OTEL. In development, `pino-pretty` formats the logs nicely.
- **Metrics**: Ready for Prometheus / custom exporters via `MetricsService`.

> **Note**: `src/main.ts` must keep `@/infrastructure/observability/tracing.bootstrap` as the very first import so auto-instrumentation patches load correctly.

## Testing

Tests are written using Jest and E2E tests utilize Supertest.

```bash
# Run unit tests
pnpm run test

# Run e2e tests
pnpm run test:e2e

# Run tests with coverage
pnpm run test:cov
```

## Adding New Features

When adding a new feature, follow the modular structure:
1. Create a new folder under `src/modules/<feature-name>`.
2. Generate the necessary files: `<feature>.module.ts`, `<feature>.controller.ts`, `services/<feature>.service.ts`, `repositories/<feature>.repository.ts`, etc.
3. Keep business logic in **Services**, and database interactions in **Repositories**.
4. Import your new module into `src/app.module.ts`.

> **Rule of Thumb**: Never put providers or controllers directly in `app.module.ts`. Keep them scoped to their respective feature modules.

## AI & Vibe Coding

If you use AI coding assistants (like Cursor, Copilot, Cline, or Antigravity) to "vibe code" and rapidly generate new features, you **must always mention or include the `.agents/AGENTS.md` file in your prompt context.**

This repository ships with a comprehensive `.agents/AGENTS.md` file containing 40 strict NestJS architectural rules, patterns, and conventions specific to this boilerplate. By feeding this file to your AI, you ensure that the generated code flawlessly matches the existing Repository Patterns, strict DI rules, and DTO validations without hallucinating random or outdated NestJS approaches.

## Contributing

We are completely open to contributions! If you see any improvements that can be made—whether it's optimizing the architecture, fixing a bug, updating a package, or adding a cool new feature that belongs in a production template—please feel free to open an issue or submit a Pull Request.

Let's build the best NestJS starter together!
