import { Inject, Injectable } from '@nestjs/common';
import { CACHE_PORT } from '@/infrastructure/redis/redis.constants';
import type { CachePort } from '@/infrastructure/redis/redis.types';

export type OtpPurpose =
  | 'login'
  | 'register-verify'
  | 'reset-password'
  | 'enroll-2fa';

export interface OtpRecord {
  codeHash: string;
  destination: string;
  attempts: number;
  sentAt: number;
}

export interface PasswordResetRecord {
  userId: string;
}

export interface EmailVerifyRecord {
  userId: string;
  email: string;
}

export interface TwoFactorChallengeRecord {
  userId: string;
  methodIds: string[];
  ip?: string;
  userAgent?: string;
  createdAt: number;
}

export interface SessionMirrorRecord {
  userId: string;
}

@Injectable()
export class AuthCacheService {
  constructor(@Inject(CACHE_PORT) private readonly cache: CachePort) {}

  // ---------- OTP (email/sms) ----------
  async setOtp(
    channel: 'email' | 'sms',
    userId: string,
    purpose: OtpPurpose,
    record: OtpRecord,
    ttlSeconds: number,
  ): Promise<void> {
    await this.cache.set(
      this.otpKey(channel, userId, purpose),
      record,
      ttlSeconds,
    );
  }

  getOtp(
    channel: 'email' | 'sms',
    userId: string,
    purpose: OtpPurpose,
  ): Promise<OtpRecord | null> {
    return this.cache.get<OtpRecord>(this.otpKey(channel, userId, purpose));
  }

  async deleteOtp(
    channel: 'email' | 'sms',
    userId: string,
    purpose: OtpPurpose,
  ): Promise<void> {
    await this.cache.del(this.otpKey(channel, userId, purpose));
  }

  // ---------- OTP throttle (per destination) ----------
  async getOtpThrottle(
    channel: 'email' | 'sms',
    destination: string,
  ): Promise<number> {
    const value = await this.cache.get<number>(
      this.otpThrottleKey(channel, destination),
    );
    return value ?? 0;
  }

  async setOtpThrottle(
    channel: 'email' | 'sms',
    destination: string,
    count: number,
    ttlSeconds: number,
  ): Promise<void> {
    await this.cache.set(
      this.otpThrottleKey(channel, destination),
      count,
      ttlSeconds,
    );
  }

  // ---------- Password reset ----------
  async setPasswordReset(
    tokenHash: string,
    record: PasswordResetRecord,
    ttlSeconds: number,
  ): Promise<void> {
    await this.cache.set(this.passwordResetKey(tokenHash), record, ttlSeconds);
  }

  getPasswordReset(tokenHash: string): Promise<PasswordResetRecord | null> {
    return this.cache.get<PasswordResetRecord>(
      this.passwordResetKey(tokenHash),
    );
  }

  async deletePasswordReset(tokenHash: string): Promise<void> {
    await this.cache.del(this.passwordResetKey(tokenHash));
  }

  // ---------- Email verify ----------
  async setEmailVerify(
    tokenHash: string,
    record: EmailVerifyRecord,
    ttlSeconds: number,
  ): Promise<void> {
    await this.cache.set(this.emailVerifyKey(tokenHash), record, ttlSeconds);
  }

  getEmailVerify(tokenHash: string): Promise<EmailVerifyRecord | null> {
    return this.cache.get<EmailVerifyRecord>(this.emailVerifyKey(tokenHash));
  }

  async deleteEmailVerify(tokenHash: string): Promise<void> {
    await this.cache.del(this.emailVerifyKey(tokenHash));
  }

  // ---------- 2FA challenge ----------
  async setTwoFactorChallenge(
    challengeId: string,
    record: TwoFactorChallengeRecord,
    ttlSeconds: number,
  ): Promise<void> {
    await this.cache.set(
      this.twoFactorChallengeKey(challengeId),
      record,
      ttlSeconds,
    );
  }

  getTwoFactorChallenge(
    challengeId: string,
  ): Promise<TwoFactorChallengeRecord | null> {
    return this.cache.get<TwoFactorChallengeRecord>(
      this.twoFactorChallengeKey(challengeId),
    );
  }

  async deleteTwoFactorChallenge(challengeId: string): Promise<void> {
    await this.cache.del(this.twoFactorChallengeKey(challengeId));
  }

  // ---------- Login fail counter ----------
  async getLoginFails(emailHash: string): Promise<number> {
    const value = await this.cache.get<number>(this.loginFailKey(emailHash));
    return value ?? 0;
  }

  async setLoginFails(
    emailHash: string,
    count: number,
    ttlSeconds: number,
  ): Promise<void> {
    await this.cache.set(this.loginFailKey(emailHash), count, ttlSeconds);
  }

  async deleteLoginFails(emailHash: string): Promise<void> {
    await this.cache.del(this.loginFailKey(emailHash));
  }

  // ---------- Refresh session mirror ----------
  async setSessionMirror(
    refreshTokenHash: string,
    record: SessionMirrorRecord,
    ttlSeconds: number,
  ): Promise<void> {
    await this.cache.set(this.sessionKey(refreshTokenHash), record, ttlSeconds);
  }

  getSessionMirror(
    refreshTokenHash: string,
  ): Promise<SessionMirrorRecord | null> {
    return this.cache.get<SessionMirrorRecord>(
      this.sessionKey(refreshTokenHash),
    );
  }

  async deleteSessionMirror(refreshTokenHash: string): Promise<void> {
    await this.cache.del(this.sessionKey(refreshTokenHash));
  }

  // ---------- Key builders ----------
  private otpKey(
    channel: 'email' | 'sms',
    userId: string,
    purpose: OtpPurpose,
  ): string {
    return `otp:${channel}:${userId}:${purpose}`;
  }
  private otpThrottleKey(
    channel: 'email' | 'sms',
    destination: string,
  ): string {
    return `otp:throttle:${channel}:${destination}`;
  }
  private passwordResetKey(tokenHash: string): string {
    return `pwd-reset:${tokenHash}`;
  }
  private emailVerifyKey(tokenHash: string): string {
    return `email-verify:${tokenHash}`;
  }
  private twoFactorChallengeKey(challengeId: string): string {
    return `2fa-challenge:${challengeId}`;
  }
  private loginFailKey(emailHash: string): string {
    return `login:fail:${emailHash}`;
  }
  private sessionKey(refreshTokenHash: string): string {
    return `session:${refreshTokenHash}`;
  }
}
