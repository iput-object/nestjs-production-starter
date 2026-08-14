import { Inject, Injectable } from '@nestjs/common';
import { CACHE_PORT } from '@/infrastructure/redis/redis.constants';
import type { CachePort } from '@/infrastructure/redis/redis.types';
import type { OtpPurpose } from '@/core/auth/constants/otp-purpose.constants';

export type { OtpPurpose };

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
  channel: 'email' | 'sms';
}

export interface TwoFactorChallengeRecord {
  userId: string;
  methodIds: string[];
  ip?: string;
  userAgent?: string;
  createdAt: number;
}

export interface PasswordResetChallengeRecord {
  userId: string;
  channelIds: string[];
  createdAt: number;
  /** Channel of the last successfully issued reset OTP. */
  otpChannel?: 'email' | 'sms';
}

export interface SessionMirrorRecord {
  userId: string;
}

export type SudoElevateMethod = 'password' | 'otp' | '2fa';

export interface SudoGrantRecord {
  userId: string;
  sessionId: string;
  method: SudoElevateMethod;
  elevatedAt: number;
  expiresAt: number;
}

@Injectable()
export class AuthCacheService {
  constructor(@Inject(CACHE_PORT) private readonly cache: CachePort) {}

  // ---------- Unified OTP session (code + link in one record) ----------
  async setOtpSession(
    userId: string,
    purpose: OtpPurpose,
    channel: 'email' | 'sms',
    record: OtpSessionRecord,
    ttlSeconds: number,
  ): Promise<void> {
    await this.cache.set(
      this.otpSessionKey(userId, purpose, channel),
      record,
      ttlSeconds,
    );
  }

  getOtpSession(
    userId: string,
    purpose: OtpPurpose,
    channel: 'email' | 'sms',
  ): Promise<OtpSessionRecord | null> {
    return this.cache.get<OtpSessionRecord>(
      this.otpSessionKey(userId, purpose, channel),
    );
  }

  async deleteOtpSession(
    userId: string,
    purpose: OtpPurpose,
    channel: 'email' | 'sms',
  ): Promise<void> {
    await this.cache.del(this.otpSessionKey(userId, purpose, channel));
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

  // ---------- Sudo grant (session-bound) ----------
  async setSudoGrant(
    userId: string,
    sessionId: string,
    record: SudoGrantRecord,
    ttlSeconds: number,
  ): Promise<void> {
    await this.cache.set(
      this.sudoGrantKey(userId, sessionId),
      record,
      ttlSeconds,
    );
  }

  getSudoGrant(
    userId: string,
    sessionId: string,
  ): Promise<SudoGrantRecord | null> {
    return this.cache.get<SudoGrantRecord>(
      this.sudoGrantKey(userId, sessionId),
    );
  }

  /** Atomically take the grant (get + delete). Returns null if missing. */
  takeSudoGrant(
    userId: string,
    sessionId: string,
  ): Promise<SudoGrantRecord | null> {
    return this.cache.take<SudoGrantRecord>(
      this.sudoGrantKey(userId, sessionId),
    );
  }

  async deleteSudoGrant(userId: string, sessionId: string): Promise<void> {
    await this.cache.del(this.sudoGrantKey(userId, sessionId));
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

  /** Atomically take the challenge so only one verify can succeed. */
  takeTwoFactorChallenge(
    challengeId: string,
  ): Promise<TwoFactorChallengeRecord | null> {
    return this.cache.take<TwoFactorChallengeRecord>(
      this.twoFactorChallengeKey(challengeId),
    );
  }

  async deleteTwoFactorChallenge(challengeId: string): Promise<void> {
    await this.cache.del(this.twoFactorChallengeKey(challengeId));
  }

  // ---------- Password-reset channel picker ----------
  async setPasswordResetChallenge(
    resetId: string,
    record: PasswordResetChallengeRecord,
    ttlSeconds: number,
  ): Promise<void> {
    await this.cache.set(
      this.passwordResetChallengeKey(resetId),
      record,
      ttlSeconds,
    );
    await this.cache.set(
      this.passwordResetUserKey(record.userId),
      resetId,
      ttlSeconds,
    );
  }

  getPasswordResetChallenge(
    resetId: string,
  ): Promise<PasswordResetChallengeRecord | null> {
    return this.cache.get<PasswordResetChallengeRecord>(
      this.passwordResetChallengeKey(resetId),
    );
  }

  async deletePasswordResetChallenge(resetId: string): Promise<void> {
    const record = await this.getPasswordResetChallenge(resetId);
    await this.cache.del(this.passwordResetChallengeKey(resetId));
    if (record?.userId) {
      await this.cache.del(this.passwordResetUserKey(record.userId));
    }
  }

  /** Clear any open forgot-password picker for the user (OTP or magic-link). */
  async deletePasswordResetChallengeForUser(userId: string): Promise<void> {
    const resetId = await this.cache.take<string>(
      this.passwordResetUserKey(userId),
    );
    if (resetId) {
      await this.cache.del(this.passwordResetChallengeKey(resetId));
    }
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
  private otpSessionKey(
    userId: string,
    purpose: OtpPurpose,
    channel: 'email' | 'sms',
  ): string {
    return `otp:session:${userId}:${purpose}:${channel}`;
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
  private sudoGrantKey(userId: string, sessionId: string): string {
    return `sudo:${userId}:${sessionId}`;
  }
  private twoFactorChallengeKey(challengeId: string): string {
    return `2fa-challenge:${challengeId}`;
  }
  private passwordResetChallengeKey(resetId: string): string {
    return `password-reset:${resetId}`;
  }
  private passwordResetUserKey(userId: string): string {
    return `password-reset-user:${userId}`;
  }
  private loginFailKey(emailHash: string): string {
    return `login:fail:${emailHash}`;
  }
  private sessionKey(refreshTokenHash: string): string {
    return `session:${refreshTokenHash}`;
  }
}
