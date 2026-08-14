import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { IdentifierType, UserStatus } from '@prisma-client';
import { AuthProvider } from '@/core/auth/constants/auth-provider.constants';
import type { TwoFactorMethodTypeValue } from '@/core/auth/constants/two-factor-method.constants';
import { AUTH_POLICY } from '@/configs/auth.policy';
import { CryptoService } from '@/common/crypto/crypto.service';
import { AuditService } from '@/core/audit/services/audit.service';
import {
  AUTH_AUDIT_MODULE,
  AUTH_AUDIT_RESOURCE,
  AuthAuditAction,
} from '@/core/auth/constants/auth-audit.constants';
import {
  normalizeEmail,
  normalizePhone,
} from '@/core/auth/helpers/normalize.helper';
import { AuthCacheService } from '@/core/auth/services/auth-cache.service';
import { TokenService } from '@/core/auth/services/token.service';
import { TwoFactorService } from '@/core/auth/services/two-factor.service';
import { CredentialRepository } from '@/core/auth/repositories/credential.repository';
import { IdentifierRepository } from '@/core/auth/repositories/identifier.repository';
import { TwoFactorRepository } from '@/core/auth/repositories/two-factor.repository';
import { UserRepository } from '@/core/auth/repositories/user.repository';
import type { LoginDto } from '@/core/auth/dto/request/login.dto';
import type { AuthTokens } from '@/core/auth/types/auth-tokens.type';
import type { AuthUser } from '@/core/auth/types/auth-user.type';
import locals from '@/locals';

export type LoginResult =
  | { kind: 'tokens'; tokens: AuthTokens; user: AuthUser }
  | {
      kind: 'two-factor';
      challengeId: string;
      methods: TwoFactorMethodTypeValue[];
    };

/**
 * Issues a session even when the account is unverified. Business routes are
 * gated by {@link JwtAuthGuard}; the client uses isAccountVerified on AuthUser
 * to send the user to the verify screen.
 */
@Injectable()
export class LoginService {
  constructor(
    private readonly crypto: CryptoService,
    private readonly cache: AuthCacheService,
    private readonly users: UserRepository,
    private readonly identifiers: IdentifierRepository,
    private readonly credentials: CredentialRepository,
    private readonly twoFactorRepo: TwoFactorRepository,
    private readonly twoFactor: TwoFactorService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  async login(dto: LoginDto): Promise<LoginResult> {
    const resolved = dto.email
      ? { type: IdentifierType.EMAIL, value: normalizeEmail(dto.email) }
      : { type: IdentifierType.PHONE, value: normalizePhone(dto.phone ?? '') };
    const identityHash = this.crypto.hashSha256(resolved.value);

    const fails = await this.cache.getLoginFails(identityHash);
    if (fails >= AUTH_POLICY.loginMaxFails) {
      await this.audit.record({
        module: AUTH_AUDIT_MODULE,
        action: AuthAuditAction.LOGIN_LOCKOUT,
        outcome: 'FAILURE',
        metadata: { identityHash },
      });
      throw new HttpException(
        locals.auth.too_many_failed_attempts,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const owner = await this.identifiers.findActiveOwner(
      resolved.type,
      resolved.value,
    );
    if (!owner) {
      await this.recordFail(identityHash, fails);
      throw new UnauthorizedException(locals.auth.invalid_credentials);
    }
    const { user } = owner;

    if (user.status !== UserStatus.ACTIVE) {
      await this.recordFail(identityHash, fails, user.id);
      throw new UnauthorizedException(locals.auth.invalid_credentials);
    }

    const credential = await this.credentials.findByUserAndProvider(
      user.id,
      AuthProvider.EMAIL,
    );
    if (!credential || !credential.passwordHash) {
      await this.recordFail(identityHash, fails, user.id);
      throw new UnauthorizedException(locals.auth.invalid_credentials);
    }

    const matches = await bcrypt.compare(dto.password, credential.passwordHash);
    if (!matches) {
      await this.recordFail(identityHash, fails, user.id);
      throw new UnauthorizedException(locals.auth.invalid_credentials);
    }

    await this.cache.deleteLoginFails(identityHash);
    await this.credentials.touchLastUsed(credential.id);

    const isAccountVerified = await this.identifiers.isAccountVerified(user.id);

    // 2FA only applies once the account is verified — unfinished signups
    // should land on the verify screen, not a second factor challenge.
    if (isAccountVerified) {
      const enabledMethods = await this.twoFactorRepo.findEnabledForUser(
        user.id,
      );
      if (enabledMethods.length > 0) {
        const challenge = await this.twoFactor.issueChallenge(
          user,
          enabledMethods,
        );
        return {
          kind: 'two-factor',
          challengeId: challenge.challengeId,
          methods: challenge.methods,
        };
      }
    }

    const authUser = await this.users.findAuthUser(user.id);
    if (!authUser) {
      throw new UnauthorizedException(locals.auth.account_no_longer_available);
    }
    const tokens = await this.tokens.issue(user.id);
    await this.audit.record({
      module: AUTH_AUDIT_MODULE,
      action: AuthAuditAction.LOGIN_SUCCESS,
      userId: user.id,
      resourceType: AUTH_AUDIT_RESOURCE.USER,
      resourceId: user.id,
      metadata: { isAccountVerified },
    });
    return { kind: 'tokens', tokens, user: authUser };
  }

  private async recordFail(
    identityHash: string,
    current: number,
    userId?: string,
  ): Promise<void> {
    await this.cache.setLoginFails(
      identityHash,
      current + 1,
      AUTH_POLICY.loginLockoutTtlSeconds,
    );
    await this.audit.record({
      module: AUTH_AUDIT_MODULE,
      action: AuthAuditAction.LOGIN_FAIL,
      outcome: 'FAILURE',
      userId: userId ?? null,
      resourceType: userId ? AUTH_AUDIT_RESOURCE.USER : undefined,
      resourceId: userId,
      metadata: { identityHash },
    });
  }
}
