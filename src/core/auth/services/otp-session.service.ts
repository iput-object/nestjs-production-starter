import * as bcrypt from 'bcryptjs';
import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { OTP_POLICY } from '@/configs/auth.policy';
import { CryptoService } from '@/common/crypto/crypto.service';
import { format } from '@/common/utils/format.util';
import locals from '@/locals';
import {
  OTP_PURPOSE_REGISTRY,
  tokensForPurpose,
  type OtpChannel,
  type OtpPurpose,
} from '@/core/auth/constants/otp-purpose.constants';
import {
  AuthCacheService,
  OtpSessionRecord,
} from '@/core/auth/services/auth-cache.service';
import { DevSecretLogger } from '@/core/auth/services/dev-secret-logger.service';
import {
  AuthOtpTransporter,
  TransportType,
} from '@/core/auth/transporters/auth-otp.transporter';

export interface IssueOtpSessionInput {
  userId: string;
  purpose: OtpPurpose;
  channel: OtpChannel;
  destination: string;
}

export interface ConsumedOtpSession {
  userId: string;
  purpose: OtpPurpose;
  destination: string;
  channel: OtpChannel;
}

/**
 * Unified OTP challenge: one Redis record holds code and/or link token hashes.
 * Consuming either secret destroys the session ("one send, one winner").
 * Sessions are keyed by userId + purpose + channel so email and SMS do not collide.
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
    const config = OTP_PURPOSE_REGISTRY[input.purpose];
    const tokens = tokensForPurpose(input.purpose, input.channel);
    if (tokens.length === 0) {
      return;
    }

    const existing = await this.cache.getOtpSession(
      input.userId,
      input.purpose,
      input.channel,
    );
    if (existing) {
      const ageSeconds = Math.floor((Date.now() - existing.sentAt) / 1000);
      if (ageSeconds < OTP_POLICY.resendCooldownSeconds) {
        throw new HttpException(
          format(locals.auth.otp_resend_cooldown, {
            seconds: OTP_POLICY.resendCooldownSeconds - ageSeconds,
          }),
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      await this.destroy(existing);
    }

    const sends = await this.cache.getOtpThrottle(
      input.channel,
      input.destination,
    );
    if (sends >= OTP_POLICY.maxSendsPerWindow) {
      throw new HttpException(
        locals.auth.too_many_requests_destination,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const transports =
      input.channel === 'email' ? [TransportType.EMAIL] : [TransportType.SMS];

    const generated = await this.transporter.dispatch({
      type: config.mailType,
      transports,
      tokens,
      recipient: {
        userId: input.userId,
        email: input.channel === 'email' ? input.destination : undefined,
        phoneNumber: input.channel === 'sms' ? input.destination : undefined,
      },
      expiresInMinutes: Math.round(config.ttlSeconds / 60),
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
      input.channel,
      {
        userId: input.userId,
        purpose: input.purpose,
        channel: input.channel,
        destination: input.destination,
        codeHash: generated.codeHash,
        tokenHash: generated.tokenHash,
        attempts: 0,
        sentAt: Date.now(),
        expiresAt: Date.now() + config.ttlSeconds * 1000,
      },
      config.ttlSeconds,
    );

    if (generated.tokenHash) {
      await this.cache.setOtpTokenIndex(
        generated.tokenHash,
        {
          userId: input.userId,
          purpose: input.purpose,
          channel: input.channel,
        },
        config.ttlSeconds,
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
    channel: OtpChannel,
    code: string,
  ): Promise<ConsumedOtpSession> {
    const record = await this.cache.getOtpSession(userId, purpose, channel);
    if (!record?.codeHash) {
      throw new UnauthorizedException(locals.auth.code_invalid_or_expired);
    }

    if (record.attempts >= OTP_POLICY.maxAttempts) {
      await this.destroy(record);
      throw new HttpException(
        locals.auth.too_many_incorrect_attempts,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const matches = await bcrypt.compare(code, record.codeHash);
    if (!matches) {
      await this.cache.setOtpSession(
        userId,
        purpose,
        channel,
        { ...record, attempts: record.attempts + 1 },
        this.remainingTtlSeconds(record),
      );
      throw new UnauthorizedException(locals.auth.code_invalid_or_expired);
    }

    await this.destroy(record);
    return this.consumed(record);
  }

  async verifyByToken(
    rawToken: string,
    expectedPurpose: OtpPurpose,
  ): Promise<ConsumedOtpSession> {
    const tokenHash = this.crypto.hashSha256(rawToken);
    const index = await this.cache.getOtpTokenIndex(tokenHash);
    if (!index || index.purpose !== expectedPurpose) {
      throw new UnauthorizedException(locals.auth.link_invalid_or_expired);
    }

    const record = await this.cache.getOtpSession(
      index.userId,
      index.purpose,
      index.channel,
    );
    if (
      !record ||
      record.tokenHash !== tokenHash ||
      record.purpose !== expectedPurpose
    ) {
      await this.cache.deleteOtpTokenIndex(tokenHash);
      throw new UnauthorizedException(locals.auth.link_invalid_or_expired);
    }

    await this.destroy(record);
    return this.consumed(record);
  }

  private async destroy(record: OtpSessionRecord): Promise<void> {
    await this.cache.deleteOtpSession(
      record.userId,
      record.purpose,
      record.channel,
    );
    if (record.tokenHash) {
      await this.cache.deleteOtpTokenIndex(record.tokenHash);
    }
  }

  private consumed(record: OtpSessionRecord): ConsumedOtpSession {
    return {
      userId: record.userId,
      purpose: record.purpose,
      destination: record.destination,
      channel: record.channel,
    };
  }

  private remainingTtlSeconds(record: OtpSessionRecord): number {
    return Math.max(1, Math.ceil((record.expiresAt - Date.now()) / 1000));
  }
}
