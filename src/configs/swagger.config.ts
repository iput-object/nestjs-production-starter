import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Config } from './environment.config';

export async function setupSwagger(app: INestApplication): Promise<void> {
  const config = app.get(ConfigService<Config>);
  const swagger = new DocumentBuilder()
    .setTitle(config.get('app', { infer: true })!.name)
    .setDescription(
      [
        'Production NestJS API.',
        '',
        '## Authentication token delivery',
        '',
        'Token-issuing auth endpoints use **one channel only**, chosen by the client:',
        '',
        '- **Web (default):** omit the `X-Auth-Transport` header. Tokens are set as',
        '  `httpOnly` cookies (`access_token`, `refresh_token`) and are **not** in the',
        '  response body, so JavaScript can never read them.',
        '- **Mobile / API clients:** send `X-Auth-Transport: bearer`. Tokens are returned',
        '  in the response body under `tokens` and **no** cookie is set; send the access',
        '  token back as `Authorization: Bearer <token>`.',
        '',
        'Applies to `POST /auth/login`, `/auth/register`, and `/auth/2fa/challenge/verify`.',
        '',
        '`POST /auth/refresh` ignores the header and instead follows where the refresh',
        'token is presented: in the request body → new tokens in the body; via the',
        'refresh cookie → a new cookie is set and the body carries no tokens.',
      ].join('\n'),
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        in: 'header',
      },
      'access-token',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swagger);

  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  const docsDir = join(process.cwd(), 'docs');
  await mkdir(docsDir, { recursive: true });
  await writeFile(
    join(docsDir, 'swagger.json'),
    JSON.stringify(document, null, 2),
    'utf8',
  );
}
