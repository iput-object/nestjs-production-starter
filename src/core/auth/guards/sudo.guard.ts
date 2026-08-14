import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import type { JwtPayload } from '@/core/auth/types/jwt-payload.type';
import locals from '@/locals';

/**
 * Requires a sudo-elevated access token. Stack after {@link JwtAuthGuard}.
 *
 * The user must have re-authenticated via `POST /auth/sudo` to obtain a
 * short-lived access token that carries `sudo: true`.
 */
@Injectable()
export class SudoGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload }>();
    const user = request.user;

    if (user?.sudo === true) {
      return true;
    }

    throw new ForbiddenException(locals.auth.sudo_required);
  }
}
