import { applyDecorators, UseGuards, UseInterceptors } from '@nestjs/common';
import { SUDO_ENABLED } from '@/core/auth/auth.constants';
import { JwtAuthGuard } from '@/core/auth/guards/jwt.guard';
import { SudoGuard } from '@/core/auth/guards/sudo.guard';
import { SudoConsumeInterceptor } from '@/core/auth/interceptors/sudo-consume.interceptor';

/**
 * JWT + an active sudo grant. `{ consume: true }` takes the grant after success.
 * When {@link SUDO_ENABLED} is false, only JWT is applied.
 */
export const RequireSudo = (options?: { consume?: boolean }) => {
  if (!SUDO_ENABLED) {
    return applyDecorators(UseGuards(JwtAuthGuard));
  }
  return applyDecorators(
    UseGuards(JwtAuthGuard, SudoGuard),
    ...(options?.consume ? [UseInterceptors(SudoConsumeInterceptor)] : []),
  );
};
