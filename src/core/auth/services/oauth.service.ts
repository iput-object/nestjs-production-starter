import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import * as jose from 'jose';
import { IdentifierType, UserStatus } from '@prisma-client';
import {
  AuthProvider,
  type AuthProviderValue,
} from '@/core/auth/constants/auth-provider.constants';
import { Config } from '@/configs/environment.config';
import { AuditService } from '@/common/audit/services/audit.service';
import { PrismaService } from '@/database/prisma.service';
import {
  AUTH_AUDIT_MODULE,
  AUTH_AUDIT_RESOURCE,
  AuthAuditAction,
} from '@/core/auth/constants/auth-audit.constants';
import { normalizeEmail } from '@/core/auth/helpers/normalize.helper';
import { CredentialRepository } from '@/core/auth/repositories/credential.repository';
import { IdentifierRepository } from '@/core/auth/repositories/identifier.repository';
import { UserRepository } from '@/core/auth/repositories/user.repository';
import { TokenService } from '@/core/auth/services/token.service';
import type {
  AuthTokens,
  RequestContext,
} from '@/core/auth/types/auth-tokens.type';
import type { AuthUser } from '@/core/auth/types/auth-user.type';
import locals from '@/locals';

type VerifiedOAuthIdentity = {
  provider: AuthProviderValue;
  providerId: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
};

export type OAuthLoginResult = {
  tokens: AuthTokens;
  user: AuthUser;
  linked: boolean;
};

@Injectable()
export class OAuthService {
  private googleClient: OAuth2Client | null = null;
  private appleJwks: ReturnType<typeof jose.createRemoteJWKSet> | null = null;

  constructor(
    private readonly config: ConfigService<Config>,
    private readonly prisma: PrismaService,
    private readonly users: UserRepository,
    private readonly credentials: CredentialRepository,
    private readonly identifiers: IdentifierRepository,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  async loginWithGoogle(
    idToken: string,
    context: RequestContext = {},
  ): Promise<OAuthLoginResult> {
    const identity = await this.verifyGoogle(idToken);
    return this.loginOrCreate(identity, context);
  }

  async loginWithApple(
    idToken: string,
    context: RequestContext = {},
  ): Promise<OAuthLoginResult> {
    const identity = await this.verifyApple(idToken);
    return this.loginOrCreate(identity, context);
  }

  async linkGoogle(
    userId: string,
    idToken: string,
    context: RequestContext = {},
  ): Promise<void> {
    const identity = await this.verifyGoogle(idToken);
    await this.linkToUser(userId, identity, context);
  }

  async linkApple(
    userId: string,
    idToken: string,
    context: RequestContext = {},
  ): Promise<void> {
    const identity = await this.verifyApple(idToken);
    await this.linkToUser(userId, identity, context);
  }

  private async loginOrCreate(
    identity: VerifiedOAuthIdentity,
    context: RequestContext,
  ): Promise<OAuthLoginResult> {
    const existing = await this.users.findByProviderIdentity(
      identity.provider,
      identity.providerId,
    );
    if (existing) {
      if (existing.status !== UserStatus.ACTIVE || existing.isDeleted) {
        throw new UnauthorizedException(
          locals.auth.account_no_longer_available,
        );
      }
      const authUser = await this.users.findAuthUser(existing.id);
      if (!authUser) {
        throw new UnauthorizedException(
          locals.auth.account_no_longer_available,
        );
      }
      const tokens = await this.tokens.issue(existing.id, context);
      await this.audit.record({
        module: AUTH_AUDIT_MODULE,
        action: AuthAuditAction.OAUTH_LOGIN,
        userId: existing.id,
        resourceType: AUTH_AUDIT_RESOURCE.USER,
        resourceId: existing.id,
        context,
        metadata: { provider: identity.provider },
      });
      return { tokens, user: authUser, linked: false };
    }

    if (identity.email) {
      const email = normalizeEmail(identity.email);
      const byIdentifier = await this.identifiers.findByTypeValue(
        IdentifierType.EMAIL,
        email,
      );
      if (byIdentifier) {
        throw new ConflictException(locals.auth.oauth_email_conflict);
      }
    }

    if (identity.email && !identity.emailVerified) {
      throw new BadRequestException(locals.auth.oauth_email_unverified);
    }

    const email = identity.email ? normalizeEmail(identity.email) : null;
    const user = await this.prisma.$transaction(async (tx) => {
      return tx.user.create({
        data: {
          profile: identity.name
            ? { create: { name: identity.name } }
            : undefined,
          credentials: {
            create: {
              provider: identity.provider,
              providerId: identity.providerId,
            },
          },
          ...(email
            ? {
                identifiers: {
                  create: {
                    type: IdentifierType.EMAIL,
                    value: email,
                    isPrimary: true,
                    isVerified: identity.emailVerified,
                    verifiedAt: identity.emailVerified ? new Date() : null,
                  },
                },
              }
            : {}),
        },
      });
    });

    const authUser = await this.users.findAuthUser(user.id);
    if (!authUser) {
      throw new UnauthorizedException(locals.auth.account_no_longer_available);
    }
    const tokens = await this.tokens.issue(user.id, context);
    await this.audit.record({
      module: AUTH_AUDIT_MODULE,
      action: AuthAuditAction.OAUTH_LOGIN,
      userId: user.id,
      resourceType: AUTH_AUDIT_RESOURCE.USER,
      resourceId: user.id,
      context,
      metadata: { provider: identity.provider, created: true },
    });
    return { tokens, user: authUser, linked: false };
  }

  private async linkToUser(
    userId: string,
    identity: VerifiedOAuthIdentity,
    context: RequestContext,
  ): Promise<void> {
    const existing = await this.credentials.findByProviderIdentity(
      identity.provider,
      identity.providerId,
    );
    if (existing && existing.userId !== userId) {
      throw new ConflictException(locals.auth.oauth_account_conflict);
    }
    if (existing && existing.userId === userId) {
      return;
    }

    const sameProvider = await this.credentials.findByUserAndProvider(
      userId,
      identity.provider,
    );
    if (sameProvider) {
      throw new ConflictException(locals.auth.oauth_account_conflict);
    }

    await this.credentials.create({
      userId,
      provider: identity.provider,
      providerId: identity.providerId,
    });

    await this.audit.record({
      module: AUTH_AUDIT_MODULE,
      action: AuthAuditAction.OAUTH_LINKED,
      userId,
      resourceType: AUTH_AUDIT_RESOURCE.USER,
      resourceId: userId,
      context,
      metadata: { provider: identity.provider },
    });
  }

  private async verifyGoogle(idToken: string): Promise<VerifiedOAuthIdentity> {
    const oauth = this.config.get<Config['oauth']>('oauth')!;
    const audiences = oauth.google.clientIds;
    if (!audiences.length) {
      throw new BadRequestException(locals.auth.oauth_not_configured);
    }

    if (!this.googleClient) {
      this.googleClient = new OAuth2Client();
    }

    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: audiences,
      });
      const payload = ticket.getPayload();
      if (!payload?.sub) {
        throw new UnauthorizedException(locals.auth.oauth_token_invalid);
      }
      return {
        provider: AuthProvider.GOOGLE,
        providerId: payload.sub,
        email: payload.email ?? null,
        emailVerified: payload.email_verified === true,
        name: payload.name ?? null,
      };
    } catch (err) {
      if (
        err instanceof BadRequestException ||
        err instanceof UnauthorizedException
      ) {
        throw err;
      }
      throw new UnauthorizedException(locals.auth.oauth_token_invalid);
    }
  }

  private async verifyApple(idToken: string): Promise<VerifiedOAuthIdentity> {
    const oauth = this.config.get<Config['oauth']>('oauth')!;
    const audiences = oauth.apple.clientIds;
    if (!audiences.length) {
      throw new BadRequestException(locals.auth.oauth_not_configured);
    }

    if (!this.appleJwks) {
      this.appleJwks = jose.createRemoteJWKSet(
        new URL('https://appleid.apple.com/auth/keys'),
      );
    }

    try {
      const { payload } = await jose.jwtVerify(idToken, this.appleJwks, {
        issuer: 'https://appleid.apple.com',
        audience: audiences,
      });
      if (!payload.sub || typeof payload.sub !== 'string') {
        throw new UnauthorizedException(locals.auth.oauth_token_invalid);
      }
      const email = typeof payload.email === 'string' ? payload.email : null;
      const emailVerified =
        payload.email_verified === true || payload.email_verified === 'true';
      return {
        provider: AuthProvider.APPLE,
        providerId: payload.sub,
        email,
        emailVerified: Boolean(email && emailVerified),
        name: null,
      };
    } catch (err) {
      if (
        err instanceof BadRequestException ||
        err instanceof UnauthorizedException
      ) {
        throw err;
      }
      throw new UnauthorizedException(locals.auth.oauth_token_invalid);
    }
  }
}
