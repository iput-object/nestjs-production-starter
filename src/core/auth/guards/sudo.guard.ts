import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { SudoService } from '@/core/auth/services/sudo.service';
import type { JwtPayload } from '@/core/auth/types/jwt-payload.type';

/**
 * Requires an active session-bound sudo grant. Stack after {@link JwtAuthGuard}.
 * Mutations use {@link SudoService.runWithSudo} (timed window) or
 * {@link SudoService.runWithSudoOnce} (consume after success).
 */
@Injectable()
export class SudoGuard implements CanActivate {
  constructor(private readonly sudo: SudoService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload }>();
    const user = request.user;
    await this.sudo.requireSudo(user?.sub ?? '', user?.sid);
    return true;
  }
}
