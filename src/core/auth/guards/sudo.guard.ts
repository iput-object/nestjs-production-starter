import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { SUDO_ENABLED } from '@/core/auth/auth.constants';
import { getAuthUser } from '@/core/auth/helpers/auth-context.helper';
import { SudoService } from '@/core/auth/services/sudo.service';

/**
 * Requires an active session-bound sudo grant. Stack after {@link JwtAuthGuard}.
 * Prefer {@link RequireSudo}; pass `{ consume: true }` for one-shot mutations.
 */
@Injectable()
export class SudoGuard implements CanActivate {
  constructor(private readonly sudo: SudoService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!SUDO_ENABLED) {
      return true;
    }
    const user = getAuthUser(context);
    await this.sudo.requireSudo(user?.sub ?? '', user?.sid);
    return true;
  }
}
