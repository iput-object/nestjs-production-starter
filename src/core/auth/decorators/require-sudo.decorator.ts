import { applyDecorators, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '@/core/auth/guards/jwt.guard';
import { SudoGuard } from '@/core/auth/guards/sudo.guard';
import { SudoConsumeInterceptor } from '@/core/auth/interceptors/sudo-consume.interceptor';

/**
 * JWT + an active sudo grant. `{ consume: true }` takes the grant after success.
 */
export const RequireSudo = (options?: { consume?: boolean }) =>
  applyDecorators(
    UseGuards(JwtAuthGuard, SudoGuard),
    ...(options?.consume ? [UseInterceptors(SudoConsumeInterceptor)] : []),
  );
