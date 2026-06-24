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

// Unified challenge: one record carries both the OTP code hash and the magic
// link token hash, so consuming either method deletes the single record and
// kills the other. A reverse index maps a link's tokenHash back to its session.
export interface OtpSessionRecord {
  userId: string;
  purpose: OtpPurpose;
  channel: 'email' | 'sms';
  destination: string;
  codeHash?: string;
  tokenHash?: string;
  attempts: number;
  sentAt: number;
  expiresAt: number;
}

export interface OtpTokenIndexRecord {
  userId: string;
  purpose: OtpPurpose;
}

export type ResetChannel = 'email' | 'sms';

// Holds the resolved user + the channels they may reset through, so the
// follow-up send/verify calls reference an opaque id instead of re-collecting
// (and re-disclosing) the raw email/phone.
export interface ResetRequestRecord {
  userId: string;
  channels: ResetChannel[];
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

  // ---------- Unified OTP session (code + link in one record) ----------
  async setOtpSession(
    userId: string,
    purpose: OtpPurpose,
    record: OtpSessionRecord,
    ttlSeconds: number,
  ): Promise<void> {
    await this.cache.set(
      this.otpSessionKey(userId, purpose),
      record,
      ttlSeconds,
    );
  }

  getOtpSession(
    userId: string,
    purpose: OtpPurpose,
  ): Promise<OtpSessionRecord | null> {
    return this.cache.get<OtpSessionRecord>(
      this.otpSessionKey(userId, purpose),
    );
  }

  async deleteOtpSession(userId: string, purpose: OtpPurpose): Promise<void> {
    await this.cache.del(this.otpSessionKey(userId, purpose));
  }

  async setOtpTokenIndex(
    tokenHash: string,
    record: OtpTokenIndexRecord,
    ttlSeconds: number,
  ): Promise<void> {
    await this.cache.set(this.otpTokenIndexKey(tokenHash), record, ttlSeconds);
  }

  getOtpTokenIndex(tokenHash: string): Promise<OtpTokenIndexRecord | null> {
    return this.cache.get<OtpTokenIndexRecord>(
      this.otpTokenIndexKey(tokenHash),
    );
  }

  async deleteOtpTokenIndex(tokenHash: string): Promise<void> {
    await this.cache.del(this.otpTokenIndexKey(tokenHash));
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

  // ---------- Password reset request (channel discovery) ----------
  async setResetRequest(
    requestId: string,
    record: ResetRequestRecord,
    ttlSeconds: number,
  ): Promise<void> {
    await this.cache.set(this.resetRequestKey(requestId), record, ttlSeconds);
  }

  getResetRequest(requestId: string): Promise<ResetRequestRecord | null> {
    return this.cache.get<ResetRequestRecord>(this.resetRequestKey(requestId));
  }

  async deleteResetRequest(requestId: string): Promise<void> {
    await this.cache.del(this.resetRequestKey(requestId));
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
  private otpSessionKey(userId: string, purpose: OtpPurpose): string {
    return `otp:session:${userId}:${purpose}`;
  }
  private otpTokenIndexKey(tokenHash: string): string {
    return `otp:token:${tokenHash}`;
  }
  private otpThrottleKey(
    channel: 'email' | 'sms',
    destination: string,
  ): string {
    return `otp:throttle:${channel}:${destination}`;
  }
  private resetRequestKey(requestId: string): string {
    return `pwd-reset-req:${requestId}`;
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
