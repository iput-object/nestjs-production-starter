import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  type TwoFactorMethod,
  type User,
  IdentifierType,
} from '@prisma-client';
import {
  TwoFactorMethodType,
  type TwoFactorMethodTypeValue,
} from '@/core/auth/constants/two-factor-method.constants';
import { AUTH_POLICY } from '@/configs/auth.policy';
import { CryptoService } from '@/common/crypto/crypto.service';
import { OtpPurpose } from '@/core/auth/constants/otp-purpose.constants';
import { IdentifierRepository } from '@/core/auth/repositories/identifier.repository';
import { TwoFactorRepository } from '@/core/auth/repositories/two-factor.repository';
import { UserRepository } from '@/core/auth/repositories/user.repository';
import {
  AuthCacheService,
  TwoFactorChallengeRecord,
} from '@/core/auth/services/auth-cache.service';
import { AuditService } from '@/core/audit/services/audit.service';
import {
  AUTH_AUDIT_MODULE,
  AUTH_AUDIT_RESOURCE,
  AuthAuditAction,
} from '@/core/auth/constants/auth-audit.constants';
import { OtpSessionService } from '@/core/auth/services/otp-session.service';
import { SudoService } from '@/core/auth/services/sudo.service';
import { TotpService } from '@/core/auth/services/totp.service';
import type { AuthTokens } from '@/core/auth/types/auth-tokens.type';
import { TokenService } from '@/core/auth/services/token.service';
import {
  BACKUP_CODE_BYTES,
  BACKUP_CODE_COUNT,
} from '@/core/auth/auth.constants';
import locals from '@/locals';

export interface ChallengeIssued {
  challengeId: string;
  methods: TwoFactorMethodTypeValue[];
}

export interface BackupCodesResult {
  codes: string[];
}

@Injectable()
export class TwoFactorService {
  constructor(
    private readonly crypto: CryptoService,
    private readonly cache: AuthCacheService,
    private readonly twoFactor: TwoFactorRepository,
    private readonly identifiers: IdentifierRepository,
    private readonly users: UserRepository,
    private readonly otpSession: OtpSessionService,
    private readonly totp: TotpService,
    private readonly tokens: TokenService,
    private readonly sudo: SudoService,
    private readonly audit: AuditService,
  ) {}

  // ---------- Listing ----------
  listMethods(userId: string): Promise<TwoFactorMethod[]> {
    return this.twoFactor.listMethodsForUser(userId);
  }

  // ---------- Email OTP enroll ----------
  async enrollEmailOtp(userId: string, email?: string): Promise<void> {
    let destination = email;
    if (!destination) {
      const primary = await this.identifiers.findPrimary(
        userId,
        IdentifierType.EMAIL,
      );
      destination = primary?.value;
    }
    if (!destination) {
      throw new BadRequestException(locals.auth.no_email_to_enroll);
    }

    const existing = await this.twoFactor.findByUserAndType(
      userId,
      TwoFactorMethodType.EMAIL_OTP,
    );
    if (existing?.isEnabled) {
      throw new ConflictException(locals.auth.email_otp_already_enabled);
    }

    await this.twoFactor.upsert({
      userId,
      type: TwoFactorMethodType.EMAIL_OTP,
      destination,
    });

    await this.otpSession.issue({
      userId,
      purpose: OtpPurpose.ENROLL_2FA,
      channel: 'email',
      destination,
    });
  }

  async confirmEmailOtp(userId: string, code: string): Promise<void> {
    const method = await this.twoFactor.findByUserAndType(
      userId,
      TwoFactorMethodType.EMAIL_OTP,
    );
    if (!method) {
      throw new NotFoundException(locals.auth.email_otp_enrollment_not_started);
    }
    if (method.isEnabled) {
      throw new ConflictException(locals.auth.email_otp_already_enabled);
    }
    await this.otpSession.verifyByCode(
      userId,
      OtpPurpose.ENROLL_2FA,
      'email',
      code,
    );
    await this.twoFactor.enable(method.id);
    await this.audit.record({
      module: AUTH_AUDIT_MODULE,
      action: AuthAuditAction.TWO_FACTOR_ENABLED,
      userId,
      resourceType: AUTH_AUDIT_RESOURCE.TWO_FACTOR,
      metadata: { type: TwoFactorMethodType.EMAIL_OTP },
    });
  }

  // ---------- SMS OTP enroll ----------
  async enrollSmsOtp(userId: string, phone?: string): Promise<void> {
    let destination = phone;
    if (!destination) {
      const primary = await this.identifiers.findPrimary(
        userId,
        IdentifierType.PHONE,
      );
      destination = primary?.value;
    }
    if (!destination) {
      throw new BadRequestException(locals.auth.no_phone_to_enroll);
    }

    const existing = await this.twoFactor.findByUserAndType(
      userId,
      TwoFactorMethodType.SMS_OTP,
    );
    if (existing?.isEnabled) {
      throw new ConflictException(locals.auth.sms_otp_already_enabled);
    }

    await this.twoFactor.upsert({
      userId,
      type: TwoFactorMethodType.SMS_OTP,
      destination,
    });

    await this.otpSession.issue({
      userId,
      purpose: OtpPurpose.ENROLL_2FA,
      channel: 'sms',
      destination,
    });
  }

  async confirmSmsOtp(userId: string, code: string): Promise<void> {
    const method = await this.twoFactor.findByUserAndType(
      userId,
      TwoFactorMethodType.SMS_OTP,
    );
    if (!method) {
      throw new NotFoundException(locals.auth.sms_otp_enrollment_not_started);
    }
    if (method.isEnabled) {
      throw new ConflictException(locals.auth.sms_otp_already_enabled);
    }
    await this.otpSession.verifyByCode(
      userId,
      OtpPurpose.ENROLL_2FA,
      'sms',
      code,
    );
    await this.twoFactor.enable(method.id);
    await this.audit.record({
      module: AUTH_AUDIT_MODULE,
      action: AuthAuditAction.TWO_FACTOR_ENABLED,
      userId,
      resourceType: AUTH_AUDIT_RESOURCE.TWO_FACTOR,
      metadata: { type: TwoFactorMethodType.SMS_OTP },
    });
  }

  // ---------- Disable ----------
  async disable(
    userId: string,
    sessionId: string,
    methodId: string,
  ): Promise<void> {
    await this.sudo.requireSudo(userId, sessionId);
    const method = await this.twoFactor.findById(methodId);
    if (!method || method.userId !== userId) {
      throw new NotFoundException(locals.auth.two_factor_method_not_found);
    }
    await this.twoFactor.delete(methodId);

    const remaining = await this.twoFactor.findEnabledForUser(userId);
    if (remaining.length === 0) {
      await this.twoFactor.clearBackupCodes(userId);
    }
    await this.sudo.clear(userId, sessionId);
    await this.audit.record({
      module: AUTH_AUDIT_MODULE,
      action: AuthAuditAction.TWO_FACTOR_DISABLED,
      userId,
      resourceType: AUTH_AUDIT_RESOURCE.TWO_FACTOR,
      resourceId: methodId,
      metadata: { methodId, type: method.type },
    });
  }

  // ---------- Backup codes (per-user) ----------
  async regenerateBackupCodes(
    userId: string,
    sessionId: string,
  ): Promise<BackupCodesResult> {
    await this.sudo.requireSudo(userId, sessionId);
    const enabled = await this.twoFactor.findEnabledForUser(userId);
    if (enabled.length === 0) {
      throw new ConflictException(locals.auth.enable_2fa_before_backup_codes);
    }
    return { codes: await this.replaceBackupCodes(userId) };
  }

  async countBackupCodes(userId: string): Promise<{ remaining: number }> {
    const remaining = await this.twoFactor.countUnusedBackupCodes(userId);
    return { remaining };
  }

  /**
   * Issues backup codes only if the user has none yet. Returns the plaintext
   * codes (visible once) on first enrollment; null afterwards. Call after
   * confirming any 2FA method.
   */
  async issueBackupCodesIfNone(userId: string): Promise<string[] | null> {
    const existing = await this.twoFactor.countUnusedBackupCodes(userId);
    if (existing > 0) return null;
    return this.replaceBackupCodes(userId);
  }

  private async replaceBackupCodes(userId: string): Promise<string[]> {
    const codes = Array.from({ length: BACKUP_CODE_COUNT }, () =>
      this.crypto.randomToken(BACKUP_CODE_BYTES),
    );
    const hashes = codes.map((code) => this.crypto.hashSha256(code));
    await this.twoFactor.replaceBackupCodes(userId, hashes);
    return codes;
  }

  // ---------- Challenge issuance (called by login) ----------
  async issueChallenge(
    user: User,
    enabledMethods: TwoFactorMethod[],
  ): Promise<ChallengeIssued> {
    const challengeId = this.crypto.randomToken(24);

    const record: TwoFactorChallengeRecord = {
      userId: user.id,
      methodIds: enabledMethods.map((m) => m.id),
      ip: undefined,
      userAgent: undefined,
      createdAt: Date.now(),
    };

    await this.cache.setTwoFactorChallenge(
      challengeId,
      record,
      AUTH_POLICY.twoFactorChallengeTtlSeconds,
    );

    return {
      challengeId,
      methods: enabledMethods.map((m) => m.type as TwoFactorMethodTypeValue),
    };
  }

  // ---------- Challenge: send/resend OTP for email/sms ----------
  async sendChallengeCode(
    challengeId: string,
    type: TwoFactorMethodTypeValue,
  ): Promise<void> {
    if (type === TwoFactorMethodType.TOTP) {
      throw new BadRequestException(locals.auth.totp_no_sent_code);
    }
    const record = await this.cache.getTwoFactorChallenge(challengeId);
    if (!record) {
      throw new UnauthorizedException(locals.auth.challenge_invalid_or_expired);
    }
    const methods = await this.twoFactor.findEnabledForUser(record.userId);
    const method = methods.find((m) => m.type === type);
    if (
      !method ||
      !record.methodIds.includes(method.id) ||
      !method.destination
    ) {
      throw new ForbiddenException(
        locals.auth.method_not_available_for_challenge,
      );
    }
    await this.otpSession.issue({
      userId: record.userId,
      purpose: OtpPurpose.LOGIN,
      channel: type === TwoFactorMethodType.EMAIL_OTP ? 'email' : 'sms',
      destination: method.destination,
    });
  }

  // ---------- Challenge: verify ----------
  async verifyChallenge(
    challengeId: string,
    type: TwoFactorMethodTypeValue,
    code: string,
  ): Promise<AuthTokens> {
    const record = await this.cache.getTwoFactorChallenge(challengeId);
    if (!record) {
      throw new UnauthorizedException(locals.auth.challenge_invalid_or_expired);
    }

    const user = await this.users.findById(record.userId);
    if (!user) {
      throw new UnauthorizedException(locals.auth.account_no_longer_available);
    }

    const methods = await this.twoFactor.findEnabledForUser(user.id);
    const method = methods.find(
      (m) => m.type === type && record.methodIds.includes(m.id),
    );
    if (!method) {
      throw new ForbiddenException(
        locals.auth.method_not_available_for_challenge,
      );
    }

    let ok = false;
    if (type === TwoFactorMethodType.TOTP) {
      if (!method.secret) {
        throw new ForbiddenException(locals.auth.totp_method_missing_secret);
      }
      ok = this.totp.verifyEnrolled(method.secret, code);
    } else {
      try {
        const channel =
          type === TwoFactorMethodType.EMAIL_OTP ? 'email' : 'sms';
        await this.otpSession.verifyByCode(
          user.id,
          OtpPurpose.LOGIN,
          channel,
          code,
        );
        ok = true;
      } catch {
        ok = await this.tryConsumeBackupCode(user.id, code);
      }
    }

    if (!ok) {
      ok = await this.tryConsumeBackupCode(user.id, code);
    }

    if (!ok) {
      throw new UnauthorizedException(locals.auth.invalid_code);
    }

    await this.twoFactor.touchLastUsed(method.id);
    await this.cache.deleteTwoFactorChallenge(challengeId);

    return this.tokens.issue(user.id);
  }

  private async tryConsumeBackupCode(
    userId: string,
    code: string,
  ): Promise<boolean> {
    const codeHash = this.crypto.hashSha256(code);
    const backup = await this.twoFactor.findBackupCode(userId, codeHash);
    if (!backup) return false;
    await this.twoFactor.consumeBackupCode(backup.id);
    return true;
  }
}
