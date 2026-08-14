import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { UserStatus } from '@prisma-client';
import { AUTH_POLICY } from '@/configs/auth.policy';
import { AuditService } from '@/core/audit/services/audit.service';
import {
  AUTH_AUDIT_MODULE,
  AUTH_AUDIT_RESOURCE,
  AuthAuditAction,
} from '@/core/auth/constants/auth-audit.constants';
import { IdentifierRepository } from '@/core/auth/repositories/identifier.repository';
import { UserRepository } from '@/core/auth/repositories/user.repository';
import { SudoService } from '@/core/auth/services/sudo.service';
import { TokenService } from '@/core/auth/services/token.service';
import locals from '@/locals';

@Injectable()
export class AccountLifecycleService {
  constructor(
    private readonly users: UserRepository,
    private readonly identifiers: IdentifierRepository,
    private readonly tokens: TokenService,
    private readonly sudo: SudoService,
    private readonly audit: AuditService,
  ) {}

  async deactivate(userId: string, sessionId: string): Promise<void> {
    await this.sudo.runWithSudoOnce(userId, sessionId, async () => {
      const user = await this.users.findById(userId);
      if (!user) {
        throw new NotFoundException(locals.auth.user_not_found);
      }

      await this.users.softDelete(userId);
      await this.tokens.revokeAllForUser(userId);
      await this.audit.record({
        module: AUTH_AUDIT_MODULE,
        action: AuthAuditAction.ACCOUNT_DEACTIVATED,
        userId,
        resourceType: AUTH_AUDIT_RESOURCE.USER,
        resourceId: userId,
      });
    });
  }

  async setStatus(
    userId: string,
    status: UserStatus,
    reason?: string,
  ): Promise<void> {
    const user = await this.users.findByIdIncludingDeleted(userId);
    if (!user) {
      throw new NotFoundException(locals.auth.user_not_found);
    }
    await this.users.updateStatus(userId, status, reason);
    if (status !== UserStatus.ACTIVE) {
      await this.tokens.revokeAllForUser(userId);
    }
  }

  async reclaimIdentifiers(): Promise<{ reclaimed: number }> {
    const cutoff = new Date(
      Date.now() - AUTH_POLICY.identifierReclaimGraceSeconds * 1000,
    );
    const reclaimed = await this.identifiers.reclaimOrphaned(cutoff);
    return { reclaimed };
  }

  async assertActive(userId: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException(locals.auth.account_no_longer_available);
    }
  }
}
