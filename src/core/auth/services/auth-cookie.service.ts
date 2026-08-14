import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';
import { Config } from '@/configs/environment.config';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE_PATH,
} from '@/core/auth/auth.constants';
import type { AuthTokens } from '@/core/auth/types/auth-tokens.type';

/**
 * Mirrors the issued tokens into httpOnly cookies for web clients. Mobile
 * clients ignore these and read the same tokens from the response body; the
 * backend always sends both forms so each client uses whichever applies.
 */
@Injectable()
export class AuthCookieService {
  constructor(private readonly config: ConfigService<Config>) {}

  setAuthCookies(res: Response, tokens: AuthTokens): void {
    res.cookie(ACCESS_TOKEN_COOKIE, tokens.access.token, {
      ...this.baseOptions(),
      expires: tokens.access.expiresAt,
    });
    res.cookie(REFRESH_TOKEN_COOKIE, tokens.refresh.token, {
      ...this.baseOptions(),
      path: REFRESH_TOKEN_COOKIE_PATH,
      expires: tokens.refresh.expiresAt,
    });
  }

  clearAuthCookies(res: Response): void {
    res.clearCookie(ACCESS_TOKEN_COOKIE, this.baseOptions());
    res.clearCookie(REFRESH_TOKEN_COOKIE, {
      ...this.baseOptions(),
      path: REFRESH_TOKEN_COOKIE_PATH,
    });
  }

  private baseOptions(): CookieOptions {
    const app = this.config.get<Config['app']>('app')!;
    const auth = this.config.get<Config['auth']>('auth')!;
    return {
      httpOnly: true,
      secure: app.nodeEnv === 'production',
      sameSite: auth.cookieSameSite,
      domain: auth.cookieDomain,
      path: '/',
    };
  }
}
