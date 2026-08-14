import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserStatus } from '@prisma-client';
import { Config } from '@/configs/environment.config';
import { CryptoService } from '@/common/crypto/crypto.service';
import { AuthCacheService } from '@/core/auth/services/auth-cache.service';
import { SessionRepository } from '@/core/auth/repositories/session.repository';
import { UserRepository } from '@/core/auth/repositories/user.repository';
import { FcmTokenRepository } from '@/core/fcm-token/repositories/fcm-token.repository';
import type { JwtPayload } from '@/core/auth/types/jwt-payload.type';
import type { AuthTokens } from '@/core/auth/types/auth-tokens.type';
import { SECONDS_IN_DAY } from '@/core/auth/auth.constants';
import { AUTH_POLICY } from '@/configs/auth.policy';
import locals from '@/locals';

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Config>,
    private readonly crypto: CryptoService,
    private readonly cache: AuthCacheService,
    private readonly sessions: SessionRepository,
    private readonly users: UserRepository,
    private readonly fcmTokens: FcmTokenRepository,
  ) {}

  async issue(userId: string): Promise<AuthTokens> {
    const auth = this.config.get<Config['auth']>('auth')!;

    const accessToken = await this.signAccessToken(userId);
    const refreshToken = await this.signRefreshToken(userId);
    const refreshTokenHash = this.crypto.hashSha256(refreshToken);

    const accessTtlSeconds = this.parseDurationSeconds(auth.jwtAccessExpiresIn);
    const refreshTtlSeconds = this.parseDurationSeconds(
      auth.jwtRefreshExpiresIn,
    );
    const now = Date.now();
    const accessExpiresAt = new Date(now + accessTtlSeconds * 1000);
    const refreshExpiresAt = new Date(now + refreshTtlSeconds * 1000);

    await this.sessions.create({
      userId,
      refreshTokenHash,
      expiresAt: refreshExpiresAt,
      deviceId: null,
      deviceLabel: null,
    });

    await this.cache.setSessionMirror(
      refreshTokenHash,
      { userId },
      refreshTtlSeconds,
    );

    return {
      access: { token: accessToken, expiresAt: accessExpiresAt },
      refresh: { token: refreshToken, expiresAt: refreshExpiresAt },
    };
  }

  async refresh(presentedRefreshToken: string): Promise<AuthTokens> {
    const auth = this.config.get<Config['auth']>('auth')!;
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(presentedRefreshToken, {
        secret: auth.jwtRefreshSecret,
      });
    } catch {
      throw new UnauthorizedException(locals.auth.refresh_token_required);
    }
    if (payload.tokenType !== 'refresh') {
      throw new UnauthorizedException(locals.auth.refresh_token_required);
    }

    const user = await this.users.findById(payload.sub);
    if (!user || user.status !== UserStatus.ACTIVE) {
      await this.revokeAllForUser(payload.sub);
      throw new UnauthorizedException(locals.auth.account_no_longer_available);
    }

    return this.rotate(payload.sub, presentedRefreshToken);
  }

  async rotate(
    userId: string,
    presentedRefreshToken: string,
  ): Promise<AuthTokens> {
    const presentedHash = this.crypto.hashSha256(presentedRefreshToken);
    const session = await this.sessions.findActiveByHash(presentedHash);
    if (!session || session.userId !== userId) {
      // Treat reuse/missing as catastrophic — revoke all sessions for the user
      // (DB + Redis mirrors + FCM), not just DB rows.
      await this.revokeAllForUser(userId);
      throw new UnauthorizedException(locals.auth.refresh_token_required);
    }

    await this.sessions.revokeByHash(presentedHash);
    await this.cache.deleteSessionMirror(presentedHash);

    return this.issue(userId);
  }

  async revoke(refreshToken: string): Promise<void> {
    const hash = this.crypto.hashSha256(refreshToken);
    await this.sessions.revokeByHash(hash);
    await this.cache.deleteSessionMirror(hash);
  }

  async revokeAllForUser(userId: string): Promise<void> {
    const sessions = await this.sessions.listActiveForUser(userId);
    await this.sessions.revokeAllForUser(userId);
    await Promise.all(
      sessions.map((s) => this.cache.deleteSessionMirror(s.refreshTokenHash)),
    );
    await this.fcmTokens.deleteAllForUser(userId);
  }

  signAccessToken(userId: string): Promise<string> {
    const auth = this.config.get<Config['auth']>('auth')!;
    const payload: JwtPayload = { sub: userId, tokenType: 'access' };
    return this.jwt.signAsync(payload, {
      secret: auth.jwtAccessSecret,
      expiresIn: this.parseDurationSeconds(auth.jwtAccessExpiresIn),
    });
  }

  signRefreshToken(userId: string): Promise<string> {
    const auth = this.config.get<Config['auth']>('auth')!;
    const payload: JwtPayload = { sub: userId, tokenType: 'refresh' };
    return this.jwt.signAsync(payload, {
      secret: auth.jwtRefreshSecret,
      expiresIn: this.parseDurationSeconds(auth.jwtRefreshExpiresIn),
    });
  }

  signSudoAccessToken(userId: string): Promise<string> {
    const auth = this.config.get<Config['auth']>('auth')!;
    const payload: JwtPayload = { sub: userId, tokenType: 'access', sudo: true };
    return this.jwt.signAsync(payload, {
      secret: auth.jwtAccessSecret,
      expiresIn: AUTH_POLICY.sudoTtlSeconds,
    });
  }

  private parseDurationSeconds(input: string): number {
    // accepts "15m", "30d", "1h", "45s", or a numeric seconds value
    const match = input.trim().match(/^(\d+)\s*([smhd])?$/i);
    if (!match) return SECONDS_IN_DAY;
    const value = Number(match[1]);
    const unit = (match[2] ?? 's').toLowerCase();
    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 3600;
      case 'd':
        return value * SECONDS_IN_DAY;
      default:
        return value;
    }
  }
}
