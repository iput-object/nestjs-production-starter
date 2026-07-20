import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, from, of, switchMap, tap } from 'rxjs';
import {
  CACHE_KEY_KEY,
  CACHE_TTL_KEY,
} from '@/common/core/decorators/cache.decorator';
import { RedisService } from '@/infrastructure/redis/redis.service';

@Injectable()
export class CacheInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly redisService: RedisService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<{
      method: string;
      originalUrl: string;
    }>();

    if (request.method !== 'GET') {
      return next.handle();
    }

    const customKey = this.reflector.getAllAndOverride<string>(CACHE_KEY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const ttl = this.reflector.getAllAndOverride<number>(CACHE_TTL_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (ttl === undefined) {
      return next.handle();
    }

    const cacheKey = customKey ?? `http-cache:${request.originalUrl}`;

    return from(this.redisService.get<unknown>(cacheKey)).pipe(
      switchMap((cached) => {
        if (cached !== null) {
          return of(cached);
        }

        return next.handle().pipe(
          tap((response) => {
            void this.redisService.set(cacheKey, response, ttl);
          }),
        );
      }),
    );
  }
}
