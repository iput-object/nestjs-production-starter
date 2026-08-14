import { HttpException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { IdentifierType } from '@prisma-client';
import { AuthProvider } from '@/core/auth/constants/auth-provider.constants';
import { AUTH_POLICY } from '@/configs/auth.policy';
import { CryptoService } from '@/common/crypto/crypto.service';
import { TokenType } from '@/core/auth/helpers/otp-generator.helper';
import { resolveIdentifier } from '@/core/auth/helpers/normalize.helper';
import { CredentialRepository } from '@/core/auth/repositories/credential.repository';
import { IdentifierRepository } from '@/core/auth/repositories/identifier.repository';
import { AuthCacheService } from '@/core/auth/services/auth-cache.service';
import { OtpSessionService } from '@/core/auth/services/otp-session.service';
import {
  AUTH_AUDIT_MODULE,
  AUTH_AUDIT_RESOURCE,
  AuthAuditAction,
} from '@/core/auth/constants/auth-audit.constants';
import { AuditService } from '@/core/audit/services/audit.service';
import { TokenService } from '@/core/auth/services/token.service';
import { AuthMailType } from '@/core/auth/transporters/auth-otp.transporter';
import { BCRYPT_ROUNDS } from '@/core/auth/auth.constants';
import locals from '@/locals';

export type RecoveryChannelType = 'EMAIL' | 'PHONE';

export interface RecoveryChannel {
  id: string;
  type: RecoveryChannelType;
  destination: string;
}

export interface ForgotPasswordResult {
  resetId: string;
  channels: RecoveryChannel[];
}

/**
 * Password reset with recovery-channel picker:
 * 1) forgot(identifier) → masked verified email/phone options
 * 2) send(resetId, channelId) → OTP to the chosen channel
 * 3) resetByOtp / reset(token) → set new password
 *
 * Step 1 stays silent on missing accounts (empty channels).
 */
@Injectable()
export class PasswordResetService {
  constructor(
    private readonly crypto: CryptoService,
    private readonly cache: AuthCacheService,
    private readonly identifiers: IdentifierRepository,
    private readonly credentials: CredentialRepository,
    private readonly tokens: TokenService,
    private readonly otpSession: OtpSessionService,
    private readonly audit: AuditService,
  ) {}

  async forgot(identifier: string): Promise<ForgotPasswordResult> {
    const resetId = this.crypto.randomToken(24);
    const owner = await this.resolveOwner(identifier);
    if (!owner) {
      return { resetId, channels: [] };
    }

    const credential = await this.credentials.findByUserAndProvider(
      owner.user.id,
      AuthProvider.EMAIL,
    );
    if (!credential?.passwordHash) {
      return { resetId, channels: [] };
    }

    const verified = await this.identifiers.listVerifiedForUser(owner.user.id);
    if (verified.length === 0) {
      return { resetId, channels: [] };
    }

    const channels: RecoveryChannel[] = verified.map((row) => ({
      id: row.id,
      type: row.type,
      destination: row.value,
    }));

    await this.cache.setPasswordResetChallenge(
      resetId,
      {
        userId: owner.user.id,
        channelIds: verified.map((row) => row.id),
        createdAt: Date.now(),
      },
      AUTH_POLICY.passwordResetChallengeTtlSeconds,
    );

    return { resetId, channels };
  }

  async send(resetId: string, channelId: string): Promise<void> {
    const challenge = await this.cache.getPasswordResetChallenge(resetId);
    if (!challenge || !challenge.channelIds.includes(channelId)) {
      throw new NotFoundException(
        locals.auth.reset_challenge_invalid_or_expired,
      );
    }

    const identifier = await this.identifiers.findById(channelId);
    if (
      !identifier ||
      identifier.userId !== challenge.userId ||
      !identifier.isVerified
    ) {
      throw new NotFoundException(
        locals.auth.reset_challenge_invalid_or_expired,
      );
    }

    const channel = identifier.type === IdentifierType.EMAIL ? 'email' : 'sms';

    try {
      await this.otpSession.issue({
        userId: challenge.userId,
        purpose: 'reset-password',
        channel,
        destination: identifier.value,
        mailType: AuthMailType.RESET_PASSWORD,
        tokens:
          channel === 'email'
            ? [TokenType.CODE, TokenType.TOKEN]
            : [TokenType.CODE],
        ttlSeconds: AUTH_POLICY.passwordResetTtlSeconds,
      });
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      }
    }
  }

  async reset(token: string, newPassword: string): Promise<void> {
    const { userId, purpose } = await this.otpSession.verifyByToken(token);
    if (purpose !== 'reset-password') {
      throw new NotFoundException(locals.auth.reset_link_invalid_or_expired);
    }
    await this.applyNewPassword(userId, newPassword);
  }

  async resetByOtp(
    resetId: string,
    code: string,
    newPassword: string,
  ): Promise<void> {
    const challenge = await this.cache.getPasswordResetChallenge(resetId);
    if (!challenge) {
      throw new NotFoundException(
        locals.auth.reset_challenge_invalid_or_expired,
      );
    }

    await this.otpSession.verifyByCode(
      challenge.userId,
      'reset-password',
      code,
    );
    await this.applyNewPassword(challenge.userId, newPassword);
    await this.cache.deletePasswordResetChallenge(resetId);
  }

  private async resolveOwner(raw: string) {
    const resolved = resolveIdentifier(raw);
    return this.identifiers.findActiveOwner(resolved.type, resolved.value);
  }

  private async applyNewPassword(
    userId: string,
    newPassword: string,
  ): Promise<void> {
    const credential = await this.credentials.findByUserAndProvider(
      userId,
      AuthProvider.EMAIL,
    );
    if (!credential) {
      throw new NotFoundException(locals.auth.no_password_credential);
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.credentials.updatePasswordHash(credential.id, passwordHash);
    await this.tokens.revokeAllForUser(userId);
    await this.audit.record({
      module: AUTH_AUDIT_MODULE,
      action: AuthAuditAction.PASSWORD_RESET,
      userId,
      resourceType: AUTH_AUDIT_RESOURCE.USER,
      resourceId: userId,
    });
  }
}
