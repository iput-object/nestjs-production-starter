import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { IdentifierType } from '@prisma-client';
import { AUTH_POLICY } from '@/configs/auth.policy';
import { CryptoService } from '@/common/crypto/crypto.service';
import { AuthProvider } from '@/core/auth/constants/auth-provider.constants';
import {
  OtpPurpose,
  type OtpChannel,
} from '@/core/auth/constants/otp-purpose.constants';
import {
  TwoFactorMethodType,
  type TwoFactorMethodTypeValue,
} from '@/core/auth/constants/two-factor-method.constants';
import { CredentialRepository } from '@/core/auth/repositories/credential.repository';
import { IdentifierRepository } from '@/core/auth/repositories/identifier.repository';
import { TwoFactorRepository } from '@/core/auth/repositories/two-factor.repository';
import {
  AuthCacheService,
  type SudoElevateMethod,
  type SudoGrantRecord,
} from '@/core/auth/services/auth-cache.service';
import { OtpSessionService } from '@/core/auth/services/otp-session.service';
import { TotpService } from '@/core/auth/services/totp.service';
import type { SudoOptionSource } from '@/core/auth/dto/response/sudo-options.response.dto';
import locals from '@/locals';

export interface SudoStatus {
  active: boolean;
  expiresAt: number | null;
  method: SudoElevateMethod | null;
}

@Injectable()
export class SudoService {
  constructor(
    private readonly cache: AuthCacheService,
    private readonly credentials: CredentialRepository,
    private readonly identifiers: IdentifierRepository,
    private readonly twoFactor: TwoFactorRepository,
    private readonly otpSession: OtpSessionService,
    @Inject(forwardRef(() => TotpService))
    private readonly totp: TotpService,
    private readonly crypto: CryptoService,
  ) {}

  /** Available elevate methods for the current user (masked for UI). */
  async listOptions(userId: string): Promise<SudoOptionSource[]> {
    const methods: SudoOptionSource[] = [];

    const credential = await this.credentials.findByUserAndProvider(
      userId,
      AuthProvider.EMAIL,
    );
    if (credential?.passwordHash) {
      methods.push({ kind: 'password' });
    }

    const email = await this.identifiers.findPrimary(
      userId,
      IdentifierType.EMAIL,
    );
    if (email?.isVerified) {
      methods.push({
        kind: 'otp',
        channel: 'email',
        destination: email.value,
      });
    }

    const phone = await this.identifiers.findPrimary(
      userId,
      IdentifierType.PHONE,
    );
    if (phone?.isVerified) {
      methods.push({
        kind: 'otp',
        channel: 'sms',
        destination: phone.value,
      });
    }

    const twoFactorMethods = await this.twoFactor.findEnabledForUser(userId);
    for (const method of twoFactorMethods) {
      methods.push({
        kind: '2fa',
        type: method.type as TwoFactorMethodTypeValue,
        destination: method.destination,
        requiresSend:
          method.type === TwoFactorMethodType.EMAIL_OTP ||
          method.type === TwoFactorMethodType.SMS_OTP,
      });
    }

    return methods;
  }

  /**
   * Assert an active grant without consuming it (used by {@link SudoGuard}).
   */
  async requireSudo(
    userId: string,
    sessionId: string | undefined,
  ): Promise<void> {
    if (!sessionId) {
      throw new ForbiddenException(locals.auth.sudo_required);
    }
    const grant = await this.cache.getSudoGrant(userId, sessionId);
    if (!grant || grant.expiresAt <= Date.now()) {
      if (grant) {
        await this.cache.deleteSudoGrant(userId, sessionId);
      }
      throw new ForbiddenException(locals.auth.sudo_required);
    }
  }

  /**
   * Atomically consume the sudo grant for a one-shot mutation.
   * Parallel callers: only one wins; the rest get {@link locals.auth.sudo_required}.
   */
  async consumeSudo(
    userId: string,
    sessionId: string | undefined,
  ): Promise<void> {
    if (!sessionId) {
      throw new ForbiddenException(locals.auth.sudo_required);
    }
    const grant = await this.cache.takeSudoGrant(userId, sessionId);
    if (!grant || grant.expiresAt <= Date.now()) {
      throw new ForbiddenException(locals.auth.sudo_required);
    }
  }

  /**
   * Run a sudo-gated mutation.
   *
   * - `consume: false` (default) — GitHub-style timed window; grant stays until
   *   TTL, logout, or explicit clear.
   * - `consume: true` — one-shot; grant is taken only after `fn` succeeds so
   *   validation failures do not burn elevation.
   */
  async runWithSudo<T>(
    userId: string,
    sessionId: string | undefined,
    fn: () => Promise<T>,
    options?: { consume?: boolean },
  ): Promise<T> {
    await this.requireSudo(userId, sessionId);
    const result = await fn();
    if (options?.consume) {
      try {
        await this.consumeSudo(userId, sessionId);
      } catch {
        // Mutation already committed; grant may have expired or been taken.
      }
    }
    return result;
  }

  /** One-shot alias: {@link runWithSudo} with `consume: true`. */
  runWithSudoOnce<T>(
    userId: string,
    sessionId: string | undefined,
    fn: () => Promise<T>,
  ): Promise<T> {
    return this.runWithSudo(userId, sessionId, fn, { consume: true });
  }

  async status(
    userId: string,
    sessionId: string | undefined,
  ): Promise<SudoStatus> {
    if (!sessionId) {
      return { active: false, expiresAt: null, method: null };
    }
    const grant = await this.cache.getSudoGrant(userId, sessionId);
    if (!grant || grant.expiresAt <= Date.now()) {
      if (grant) {
        await this.cache.deleteSudoGrant(userId, sessionId);
      }
      return { active: false, expiresAt: null, method: null };
    }
    return {
      active: true,
      expiresAt: grant.expiresAt,
      method: grant.method,
    };
  }

  async clear(userId: string, sessionId: string): Promise<void> {
    await this.cache.deleteSudoGrant(userId, sessionId);
  }

  async elevateWithPassword(
    userId: string,
    sessionId: string | undefined,
    password: string,
  ): Promise<SudoGrantRecord> {
    this.requireSessionId(sessionId);
    const credential = await this.credentials.findByUserAndProvider(
      userId,
      AuthProvider.EMAIL,
    );
    if (!credential?.passwordHash) {
      throw new UnauthorizedException(locals.auth.no_password_credential);
    }

    const matches = await bcrypt.compare(password, credential.passwordHash);
    if (!matches) {
      throw new UnauthorizedException(locals.auth.sudo_elevation_failed);
    }

    return this.mint(userId, sessionId, 'password');
  }

  async requestOtp(userId: string, channel: OtpChannel): Promise<void> {
    const type =
      channel === 'email' ? IdentifierType.EMAIL : IdentifierType.PHONE;
    const primary = await this.identifiers.findPrimary(userId, type);
    if (!primary?.isVerified) {
      throw new BadRequestException(
        channel === 'email'
          ? locals.auth.sudo_no_verified_email
          : locals.auth.sudo_no_verified_phone,
      );
    }

    await this.otpSession.issue({
      userId,
      purpose: OtpPurpose.SUDO,
      channel,
      destination: primary.value,
    });
  }

  async elevateWithOtp(
    userId: string,
    sessionId: string | undefined,
    channel: OtpChannel,
    code: string,
  ): Promise<SudoGrantRecord> {
    this.requireSessionId(sessionId);
    try {
      await this.otpSession.verifyByCode(
        userId,
        OtpPurpose.SUDO,
        channel,
        code,
      );
    } catch {
      throw new UnauthorizedException(locals.auth.sudo_elevation_failed);
    }
    return this.mint(userId, sessionId, 'otp');
  }

  async requestTwoFactorOtp(
    userId: string,
    type: TwoFactorMethodTypeValue,
  ): Promise<void> {
    if (type === TwoFactorMethodType.TOTP) {
      throw new BadRequestException(locals.auth.totp_no_sent_code);
    }

    const method = await this.twoFactor.findByUserAndType(userId, type);
    if (!method?.isEnabled || !method.destination) {
      throw new ForbiddenException(
        locals.auth.method_not_available_for_challenge,
      );
    }

    await this.otpSession.issue({
      userId,
      purpose: OtpPurpose.SUDO_2FA,
      channel: type === TwoFactorMethodType.EMAIL_OTP ? 'email' : 'sms',
      destination: method.destination,
    });
  }

  async elevateWithTwoFactor(
    userId: string,
    sessionId: string | undefined,
    type: TwoFactorMethodTypeValue,
    code: string,
  ): Promise<SudoGrantRecord> {
    this.requireSessionId(sessionId);
    const ok = await this.verifyTwoFactor(userId, type, code);
    if (!ok) {
      throw new UnauthorizedException(locals.auth.sudo_elevation_failed);
    }
    return this.mint(userId, sessionId, '2fa');
  }

  private async verifyTwoFactor(
    userId: string,
    type: TwoFactorMethodTypeValue,
    code: string,
  ): Promise<boolean> {
    const method = await this.twoFactor.findByUserAndType(userId, type);
    if (!method?.isEnabled) {
      return this.tryConsumeBackupCode(userId, code);
    }

    if (type === TwoFactorMethodType.TOTP) {
      if (!method.secret) return false;
      if (this.totp.verifyEnrolled(method.secret, code)) {
        await this.twoFactor.touchLastUsed(method.id);
        return true;
      }
      return this.tryConsumeBackupCode(userId, code);
    }

    try {
      await this.otpSession.verifyByCode(
        userId,
        OtpPurpose.SUDO_2FA,
        type === TwoFactorMethodType.EMAIL_OTP ? 'email' : 'sms',
        code,
      );
      await this.twoFactor.touchLastUsed(method.id);
      return true;
    } catch {
      return this.tryConsumeBackupCode(userId, code);
    }
  }

  private async tryConsumeBackupCode(
    userId: string,
    code: string,
  ): Promise<boolean> {
    const codeHash = this.crypto.hashSha256(code);
    return this.twoFactor.tryClaimBackupCode(userId, codeHash);
  }

  private async mint(
    userId: string,
    sessionId: string,
    method: SudoElevateMethod,
  ): Promise<SudoGrantRecord> {
    const ttl = AUTH_POLICY.sudoGrantTtlSeconds;
    const record: SudoGrantRecord = {
      userId,
      sessionId,
      method,
      elevatedAt: Date.now(),
      expiresAt: Date.now() + ttl * 1000,
    };
    await this.cache.setSudoGrant(userId, sessionId, record, ttl);
    return record;
  }

  private requireSessionId(
    sessionId: string | undefined,
  ): asserts sessionId is string {
    if (!sessionId) {
      throw new ForbiddenException(locals.auth.sudo_session_required);
    }
  }
}
