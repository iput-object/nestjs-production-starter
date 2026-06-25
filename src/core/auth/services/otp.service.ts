import * as bcrypt from 'bcryptjs';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { OTP_POLICY } from '@/configs/auth.policy';
import { MAILER_PORT } from '@/infrastructure/mailer/mailer.constants';
import type { MailerPort } from '@/infrastructure/mailer/mailer.types';
import { SMS_PORT } from '@/infrastructure/sms/sms.constants';
import type { SmsPort } from '@/infrastructure/sms/sms.types';
import { CryptoService } from '@/common/crypto/crypto.service';
import { format } from '@/common/utils/format.util';
import {
  AuthCacheService,
  OtpPurpose,
} from '@/core/auth/services/auth-cache.service';
import { DevSecretLogger } from '@/core/auth/services/dev-secret-logger.service';
import locals from '@/locals';

const BCRYPT_ROUNDS = 8;

export type OtpChannel = 'email' | 'sms';

export interface SendOtpInput {
  channel: OtpChannel;
  userId: string;
  purpose: OtpPurpose;
  destination: string;
}

export interface VerifyOtpInput {
  channel: OtpChannel;
  userId: string;
  purpose: OtpPurpose;
  code: string;
}

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly crypto: CryptoService,
    private readonly cache: AuthCacheService,
    @Inject(MAILER_PORT) private readonly mailer: MailerPort,
    @Inject(SMS_PORT) private readonly sms: SmsPort,
    private readonly devSecret: DevSecretLogger,
  ) {}

  async send(input: SendOtpInput): Promise<void> {
    // Per-destination throttle prevents enumeration / abuse.
    const throttle = await this.cache.getOtpThrottle(
      input.channel,
      input.destination,
    );
    if (throttle >= OTP_POLICY.maxAttempts) {
      throw new HttpException(
        locals.auth.too_many_otp_requests_destination,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Resend cooldown: existing record sent within cooldown window blocks new send.
    const existing = await this.cache.getOtp(
      input.channel,
      input.userId,
      input.purpose,
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
    }

    if (input.channel === 'sms' && !this.sms.isConfigured()) {
      throw new ForbiddenException(locals.auth.sms_otp_not_enabled);
    }

    const code = this.crypto.randomNumericCode(OTP_POLICY.length);
    const codeHash = await bcrypt.hash(code, BCRYPT_ROUNDS);

    this.devSecret.log('otp', code, {
      channel: input.channel,
      purpose: input.purpose,
      destination: input.destination,
    });

    const ttl =
      input.channel === 'email'
        ? OTP_POLICY.emailTtlSeconds
        : OTP_POLICY.smsTtlSeconds;

    await this.cache.setOtp(
      input.channel,
      input.userId,
      input.purpose,
      {
        codeHash,
        destination: input.destination,
        attempts: 0,
        sentAt: Date.now(),
      },
      ttl,
    );
    await this.cache.setOtpThrottle(
      input.channel,
      input.destination,
      throttle + 1,
      Math.max(ttl, 60),
    );

    if (input.channel === 'email') {
      await this.mailer.send({
        to: input.destination,
        subject: this.subjectFor(input.purpose),
        text: `Your verification code is ${code}. It expires in ${Math.round(ttl / 60)} minutes.`,
        html: `<p>Your verification code is <strong>${code}</strong>.</p><p>It expires in ${Math.round(ttl / 60)} minutes.</p>`,
      });
    } else {
      await this.sms.send({
        to: input.destination,
        body: `Your verification code is ${code}. Expires in ${Math.round(ttl / 60)}m.`,
      });
    }

    this.logger.debug(
      `OTP issued: channel=${input.channel} purpose=${input.purpose}`,
    );
  }

  async verify(input: VerifyOtpInput): Promise<{ destination: string }> {
    const record = await this.cache.getOtp(
      input.channel,
      input.userId,
      input.purpose,
    );
    if (!record) {
      throw new UnauthorizedException(locals.auth.code_invalid_or_expired);
    }

    if (record.attempts >= OTP_POLICY.maxAttempts) {
      await this.cache.deleteOtp(input.channel, input.userId, input.purpose);
      throw new HttpException(
        locals.auth.too_many_incorrect_attempts,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const matches = await bcrypt.compare(input.code, record.codeHash);
    if (!matches) {
      const ttl = Math.max(
        1,
        Math.floor(
          ((input.channel === 'email'
            ? OTP_POLICY.emailTtlSeconds
            : OTP_POLICY.smsTtlSeconds) *
            1000 -
            (Date.now() - record.sentAt)) /
            1000,
        ),
      );
      await this.cache.setOtp(
        input.channel,
        input.userId,
        input.purpose,
        { ...record, attempts: record.attempts + 1 },
        ttl,
      );
      throw new UnauthorizedException(locals.auth.code_invalid_or_expired);
    }

    await this.cache.deleteOtp(input.channel, input.userId, input.purpose);
    return { destination: record.destination };
  }

  private subjectFor(purpose: OtpPurpose): string {
    switch (purpose) {
      case 'login':
        return 'Your sign-in code';
      case 'register-verify':
        return 'Verify your email';
      case 'reset-password':
        return 'Password reset code';
      case 'enroll-2fa':
        return 'Two-factor enrollment code';
    }
  }
}
