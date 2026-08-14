import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CryptoService } from '@/common/crypto/crypto.service';
import { AuthCacheService } from '@/core/auth/services/auth-cache.service';
import {
  AUTH_AUDIT_MODULE,
  AUTH_AUDIT_RESOURCE,
  AuthAuditAction,
} from '@/core/auth/constants/auth-audit.constants';
import { AuditService } from '@/core/audit/services/audit.service';
import { TokenService } from '@/core/auth/services/token.service';
import { SessionRepository } from '@/core/auth/repositories/session.repository';
import locals from '@/locals';

export interface SessionView {
  id: string;

  deviceId: string | null;
  deviceLabel: string | null;
  createdAt: Date;
  expiresAt: Date;
  current: boolean;
}

@Injectable()
export class SessionService {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly cache: AuthCacheService,
    private readonly crypto: CryptoService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  async list(
    userId: string,
    currentRefreshToken?: string,
  ): Promise<SessionView[]> {
    const rows = await this.sessions.listActiveForUser(userId);
    const currentHash = currentRefreshToken
      ? this.crypto.hashSha256(currentRefreshToken)
      : null;

    return rows.map((s) => ({
      id: s.id,

      deviceId: s.deviceId,
      deviceLabel: s.deviceLabel,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      current: currentHash != null && s.refreshTokenHash === currentHash,
    }));
  }

  async revokeOne(userId: string, sessionId: string): Promise<void> {
    const session = await this.sessions.findActiveById(sessionId);
    if (!session || session.userId !== userId) {
      throw new NotFoundException(locals.auth.session_not_found);
    }
    await this.sessions.revokeById(sessionId);
    await this.cache.deleteSessionMirror(session.refreshTokenHash);
    await this.audit.record({
      module: AUTH_AUDIT_MODULE,
      action: AuthAuditAction.SESSION_REVOKED,
      userId,
      resourceType: AUTH_AUDIT_RESOURCE.SESSION,
      resourceId: sessionId,
      metadata: { sessionId },
    });
  }

  async revokeAll(userId: string): Promise<void> {
    await this.tokens.revokeAllForUser(userId);
    await this.audit.record({
      module: AUTH_AUDIT_MODULE,
      action: AuthAuditAction.SESSION_REVOKED_ALL,
      userId,
      resourceType: AUTH_AUDIT_RESOURCE.SESSION,
    });
  }

  async requireOwnedRefresh(
    userId: string,
    refreshToken?: string,
  ): Promise<string | undefined> {
    if (!refreshToken) return undefined;
    try {
      // Best-effort: listing "current" is optional when cookie/body missing.
      const hash = this.crypto.hashSha256(refreshToken);
      const session = await this.sessions.findActiveByHash(hash);
      if (session && session.userId !== userId) {
        throw new UnauthorizedException(locals.auth.session_not_found);
      }
      return refreshToken;
    } catch {
      return undefined;
    }
  }
}
