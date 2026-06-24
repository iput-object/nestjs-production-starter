import { Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AuthTokens } from '@/core/auth/types/auth-tokens.type';
import { AuthCookieService } from '@/core/auth/services/auth-cookie.service';
import { TwoFactorService } from '@/core/auth/services/two-factor.service';
import {
  AUTH_TRANSPORT_BEARER,
  AUTH_TRANSPORT_HEADER,
  REFRESH_TOKEN_COOKIE,
} from '@/core/auth/auth.constants';

@Injectable()
export class AuthControllerHelper {
  constructor(
    private readonly twoFactor: TwoFactorService,
    private readonly cookies: AuthCookieService,
  ) {}

  public async firstEnrollmentBackupCodes(
    userId: string,
  ): Promise<{ data: { backupCodes: string[] } } | undefined> {
    const codes = await this.twoFactor.issueBackupCodesIfNone(userId);
    return codes ? { data: { backupCodes: codes } } : undefined;
  }

  public wantsBearer(req: Request): boolean {
    return (
      req.get(AUTH_TRANSPORT_HEADER)?.toLowerCase() === AUTH_TRANSPORT_BEARER
    );
  }

  // One channel only. Bearer clients get tokens in the body and no cookie; cookie
  // clients get the httpOnly cookie and nothing in the body.
  public deliverTokens(
    res: Response,
    tokens: AuthTokens,
    bearer: boolean,
  ): { tokens: AuthTokens } | undefined {
    if (bearer) {
      return { tokens };
    }
    this.cookies.setAuthCookies(res, tokens);
    return undefined;
  }

  public refreshTokenFromCookie(req: Request): string | undefined {
    const value = req.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined;
    return typeof value === 'string' ? value : undefined;
  }

  public requestContext(req: Request): { ip?: string; userAgent?: string } {
    return {
      ip: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    };
  }
}
