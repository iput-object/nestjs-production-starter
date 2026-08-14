import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ALLOW_UNVERIFIED_KEY } from '@/core/auth/decorators/allow-unverified.decorator';
import type { JwtPayload } from '@/core/auth/types/jwt-payload.type';
import locals from '@/locals';

/**
 * Requires a verified account. Pair with {@link JwtAuthGuard}.
 * Opt out per-route with {@link AllowUnverified}.
 *
 * "Account verified" means a primary email or phone identifier is verified.
 */
@Injectable()
export class VerifiedGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowUnverified = this.reflector.getAllAndOverride<boolean>(
      ALLOW_UNVERIFIED_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (allowUnverified) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload }>();
    const user = request.user;
    if (!user?.sub) {
      return false;
    }
    if (user.isAccountVerified === true) {
      return true;
    }

    throw new ForbiddenException(locals.auth.account_verification_required);
  }
}
