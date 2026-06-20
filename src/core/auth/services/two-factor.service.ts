import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { type TwoFactorMethod, type User } from '@prisma-client';
import { TwoFactorMethodType } from '@prisma-client';
import { AUTH_POLICY } from '@/configs/auth.policy';
import { CryptoService } from '@/common/crypto/crypto.service';
import { TwoFactorRepository } from '@/core/auth/repositories/two-factor.repository';
import { UserRepository } from '@/core/auth/repositories/user.repository';
import {
  AuthCacheService,
  TwoFactorChallengeRecord,
} from '@/core/auth/services/auth-cache.service';
import { OtpService } from '@/core/auth/services/otp.service';
import { TotpService } from '@/core/auth/services/totp.service';
import type {
  AuthTokens,
  RequestContext,
} from '@/core/auth/types/auth-tokens.type';
import { TokenService } from '@/core/auth/services/token.service';

const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_BYTES = 5; // → 10 hex chars

export interface ChallengeIssued {
  challengeId: string;
  methods: TwoFactorMethodType[];
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
    private readonly users: UserRepository,
    private readonly otp: OtpService,
    private readonly totp: TotpService,
    private readonly tokens: TokenService,
  ) {}

  // ---------- Listing ----------
  listMethods(userId: string): Promise<TwoFactorMethod[]> {
    return this.twoFactor.listMethodsForUser(userId);
  }

  // ---------- Email OTP enroll ----------
  async enrollEmailOtp(user: User, email?: string): Promise<void> {
    const destination = email ?? user.email;
    if (!destination) {
      throw new BadRequestException(
        'No email on file; provide an email to enroll',
      );
    }

    const existing = await this.twoFactor.findByUserAndType(
      user.id,
      TwoFactorMethodType.EMAIL_OTP,
    );
    if (existing?.isEnabled) {
      throw new ConflictException('Email OTP already enabled');
    }

    await this.twoFactor.upsert({
      userId: user.id,
      type: TwoFactorMethodType.EMAIL_OTP,
      destination,
    });

    await this.otp.send({
      channel: 'email',
      userId: user.id,
      purpose: 'enroll-2fa',
      destination,
    });
  }

  async confirmEmailOtp(userId: string, code: string): Promise<void> {
    const method = await this.twoFactor.findByUserAndType(
      userId,
      TwoFactorMethodType.EMAIL_OTP,
    );
    if (!method) {
      throw new NotFoundException('Email OTP enrollment not started');
    }
    if (method.isEnabled) {
      throw new ConflictException('Email OTP already enabled');
    }
    await this.otp.verify({
      channel: 'email',
      userId,
      purpose: 'enroll-2fa',
      code,
    });
    await this.twoFactor.enable(method.id);
  }

  // ---------- SMS OTP enroll ----------
  async enrollSmsOtp(user: User, phone?: string): Promise<void> {
    const destination = phone ?? user.phone;
    if (!destination) {
      throw new BadRequestException(
        'No phone on file; provide a phone to enroll',
      );
    }

    const existing = await this.twoFactor.findByUserAndType(
      user.id,
      TwoFactorMethodType.SMS_OTP,
    );
    if (existing?.isEnabled) {
      throw new ConflictException('SMS OTP already enabled');
    }

    await this.twoFactor.upsert({
      userId: user.id,
      type: TwoFactorMethodType.SMS_OTP,
      destination,
    });

    await this.otp.send({
      channel: 'sms',
      userId: user.id,
      purpose: 'enroll-2fa',
      destination,
    });
  }

  async confirmSmsOtp(userId: string, code: string): Promise<void> {
    const method = await this.twoFactor.findByUserAndType(
      userId,
      TwoFactorMethodType.SMS_OTP,
    );
    if (!method) {
      throw new NotFoundException('SMS OTP enrollment not started');
    }
    if (method.isEnabled) {
      throw new ConflictException('SMS OTP already enabled');
    }
    await this.otp.verify({
      channel: 'sms',
      userId,
      purpose: 'enroll-2fa',
      code,
    });
    await this.twoFactor.enable(method.id);
  }

  // ---------- Disable ----------
  async disable(userId: string, methodId: string): Promise<void> {
    const method = await this.twoFactor.findById(methodId);
    if (!method || method.userId !== userId) {
      throw new NotFoundException('Two-factor method not found');
    }
    await this.twoFactor.delete(methodId);

    // If the user has no enabled methods left, recovery codes have nothing
    // to recover to — clear them so they don't survive as a stale auth path.
    const remaining = await this.twoFactor.findEnabledForUser(userId);
    if (remaining.length === 0) {
      await this.twoFactor.clearBackupCodes(userId);
    }
  }

  // ---------- Backup codes (per-user) ----------
  async regenerateBackupCodes(userId: string): Promise<BackupCodesResult> {
    const enabled = await this.twoFactor.findEnabledForUser(userId);
    if (enabled.length === 0) {
      throw new ConflictException(
        'Enable a 2FA method before generating backup codes',
      );
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
    context: RequestContext,
  ): Promise<ChallengeIssued> {
    const challengeId = this.crypto.randomToken(24);

    const record: TwoFactorChallengeRecord = {
      userId: user.id,
      methodIds: enabledMethods.map((m) => m.id),
      ip: context.ip,
      userAgent: context.userAgent,
      createdAt: Date.now(),
    };

    await this.cache.setTwoFactorChallenge(
      challengeId,
      record,
      AUTH_POLICY.twoFactorChallengeTtlSeconds,
    );

    return {
      challengeId,
      methods: enabledMethods.map((m) => m.type),
    };
  }

  // ---------- Challenge: send/resend OTP for email/sms ----------
  async sendChallengeCode(
    challengeId: string,
    type: TwoFactorMethodType,
  ): Promise<void> {
    if (type === TwoFactorMethodType.TOTP) {
      throw new BadRequestException('TOTP does not require a sent code');
    }
    const record = await this.cache.getTwoFactorChallenge(challengeId);
    if (!record) {
      throw new UnauthorizedException('Challenge invalid or expired');
    }
    const methods = await this.twoFactor.findEnabledForUser(record.userId);
    const method = methods.find((m) => m.type === type);
    if (
      !method ||
      !record.methodIds.includes(method.id) ||
      !method.destination
    ) {
      throw new ForbiddenException('Method not available for this challenge');
    }
    await this.otp.send({
      channel: type === TwoFactorMethodType.EMAIL_OTP ? 'email' : 'sms',
      userId: record.userId,
      purpose: 'login',
      destination: method.destination,
    });
  }

  // ---------- Challenge: verify ----------
  async verifyChallenge(
    challengeId: string,
    type: TwoFactorMethodType,
    code: string,
    context: RequestContext,
  ): Promise<AuthTokens> {
    const record = await this.cache.getTwoFactorChallenge(challengeId);
    if (!record) {
      throw new UnauthorizedException('Challenge invalid or expired');
    }

    const user = await this.users.findById(record.userId);
    if (!user) {
      throw new UnauthorizedException('Account no longer available');
    }

    const methods = await this.twoFactor.findEnabledForUser(user.id);
    const method = methods.find(
      (m) => m.type === type && record.methodIds.includes(m.id),
    );
    if (!method) {
      throw new ForbiddenException('Method not available for this challenge');
    }

    let ok = false;
    if (type === TwoFactorMethodType.TOTP) {
      if (!method.secret) {
        throw new ForbiddenException('TOTP method missing secret');
      }
      ok = this.totp.verifyEnrolled(method.secret, code);
    } else {
      const channel: 'email' | 'sms' =
        type === TwoFactorMethodType.EMAIL_OTP ? 'email' : 'sms';
      try {
        await this.otp.verify({
          channel,
          userId: user.id,
          purpose: 'login',
          code,
        });
        ok = true;
      } catch {
        ok = await this.tryConsumeBackupCode(user.id, code);
      }
    }

    if (!ok) {
      ok = await this.tryConsumeBackupCode(user.id, code);
    }

    if (!ok) {
      throw new UnauthorizedException('Invalid code');
    }

    await this.twoFactor.touchLastUsed(method.id);
    await this.cache.deleteTwoFactorChallenge(challengeId);

    return this.tokens.issue(user.id, context);
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
