import * as bcrypt from 'bcryptjs';
import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { OTP_POLICY } from '@/configs/auth.policy';
import { CryptoService } from '@/common/crypto/crypto.service';
import {
  AuthCacheService,
  OtpPurpose,
  OtpSessionRecord,
} from '@/core/auth/services/auth-cache.service';
import { DevSecretLogger } from '@/core/auth/services/dev-secret-logger.service';
import { TokenType } from '@/core/auth/helpers/otp-generator.helper';
import {
  AuthMailType,
  AuthOtpTransporter,
  TransportType,
} from '@/core/auth/transporters/auth-otp.transporter';

export interface IssueOtpSessionInput {
  userId: string;
  purpose: OtpPurpose;
  channel: 'email' | 'sms';
  destination: string;
  mailType: AuthMailType;
  /** Which secrets to mint: CODE (OTP), TOKEN (magic link), or both. */
  tokens: TokenType[];
  ttlSeconds: number;
}

export interface ConsumedOtpSession {
  userId: string;
  purpose: OtpPurpose;
  destination: string;
}

/**
 * Owns the unified OTP challenge: one Redis record holds both the code hash and
 * the link token hash, and verifying via either method deletes that record so
 * the other stops working immediately ("one send, one session, one winner").
 *
 * Generation + delivery are delegated to AuthOtpTransporter; this service only
 * persists the resulting hashes and verifies them. No raw secret is stored.
 */
@Injectable()
export class OtpSessionService {
  constructor(
    private readonly cache: AuthCacheService,
    private readonly crypto: CryptoService,
    private readonly transporter: AuthOtpTransporter,
    private readonly devSecret: DevSecretLogger,
  ) {}

  async issue(input: IssueOtpSessionInput): Promise<void> {
    if (input.tokens.length === 0) {
      return;
    }

    // Resend cooldown: a live session sent within the cooldown blocks re-send.
    const existing = await this.cache.getOtpSession(
      input.userId,
      input.purpose,
    );
    if (existing) {
      const ageSeconds = Math.floor((Date.now() - existing.sentAt) / 1000);
      if (ageSeconds < OTP_POLICY.resendCooldownSeconds) {
        throw new HttpException(
          `Wait ${OTP_POLICY.resendCooldownSeconds - ageSeconds}s before requesting another code`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    // Per-destination send ceiling within a rolling window.
    const sends = await this.cache.getOtpThrottle(
      input.channel,
      input.destination,
    );
    if (sends >= OTP_POLICY.maxSendsPerWindow) {
      throw new HttpException(
        'Too many requests for this destination',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const transports =
      input.channel === 'email' ? [TransportType.EMAIL] : [TransportType.SMS];

    const generated = await this.transporter.dispatch({
      type: input.mailType,
      transports,
      tokens: input.tokens,
      recipient: {
        userId: input.userId,
        email: input.channel === 'email' ? input.destination : undefined,
        phoneNumber: input.channel === 'sms' ? input.destination : undefined,
      },
      expiresInMinutes: Math.round(input.ttlSeconds / 60),
    });

    if (generated.code) {
      this.devSecret.log('otp-code', generated.code, {
        purpose: input.purpose,
        destination: input.destination,
      });
    }
    if (generated.token) {
      this.devSecret.log('otp-token', generated.token, {
        purpose: input.purpose,
        destination: input.destination,
      });
    }

    await this.cache.setOtpSession(
      input.userId,
      input.purpose,
      {
        userId: input.userId,
        purpose: input.purpose,
        channel: input.channel,
        destination: input.destination,
        codeHash: generated.codeHash,
        tokenHash: generated.tokenHash,
        attempts: 0,
        sentAt: Date.now(),
        expiresAt: Date.now() + input.ttlSeconds * 1000,
      },
      input.ttlSeconds,
    );

    if (generated.tokenHash) {
      await this.cache.setOtpTokenIndex(
        generated.tokenHash,
        { userId: input.userId, purpose: input.purpose },
        input.ttlSeconds,
      );
    }

    await this.cache.setOtpThrottle(
      input.channel,
      input.destination,
      sends + 1,
      OTP_POLICY.sendThrottleWindowSeconds,
    );
  }

  async verifyByCode(
    userId: string,
    purpose: OtpPurpose,
    code: string,
  ): Promise<ConsumedOtpSession> {
    const record = await this.cache.getOtpSession(userId, purpose);
    if (!record?.codeHash) {
      throw new UnauthorizedException('Code is invalid or expired');
    }

    if (record.attempts >= OTP_POLICY.maxAttempts) {
      await this.destroy(record);
      throw new HttpException(
        'Too many incorrect attempts',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const matches = await bcrypt.compare(code, record.codeHash);
    if (!matches) {
      await this.cache.setOtpSession(
        userId,
        purpose,
        { ...record, attempts: record.attempts + 1 },
        this.remainingTtlSeconds(record),
      );
      throw new UnauthorizedException('Code is invalid or expired');
    }

    await this.destroy(record);
    return this.consumed(record);
  }

  async verifyByToken(rawToken: string): Promise<ConsumedOtpSession> {
    const tokenHash = this.crypto.hashSha256(rawToken);
    const index = await this.cache.getOtpTokenIndex(tokenHash);
    if (!index) {
      throw new UnauthorizedException('Link is invalid or expired');
    }

    const record = await this.cache.getOtpSession(index.userId, index.purpose);
    if (!record || record.tokenHash !== tokenHash) {
      // Index outlived its record (already consumed); clean up the dangling key.
      await this.cache.deleteOtpTokenIndex(tokenHash);
      throw new UnauthorizedException('Link is invalid or expired');
    }

    await this.destroy(record);
    return this.consumed(record);
  }

  /** Single exit point: removes the record and its token index together. */
  private async destroy(record: OtpSessionRecord): Promise<void> {
    await this.cache.deleteOtpSession(record.userId, record.purpose);
    if (record.tokenHash) {
      await this.cache.deleteOtpTokenIndex(record.tokenHash);
    }
  }

  private consumed(record: OtpSessionRecord): ConsumedOtpSession {
    return {
      userId: record.userId,
      purpose: record.purpose,
      destination: record.destination,
    };
  }

  private remainingTtlSeconds(record: OtpSessionRecord): number {
    return Math.max(1, Math.ceil((record.expiresAt - Date.now()) / 1000));
  }
}
