import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
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
import type { TwoFactorMethodTypeValue } from '@/core/auth/constants/two-factor-method.constants';
import { Config } from '@/configs/environment.config';
import { AuditService } from '@/core/audit/services/audit.service';
import { PrismaService } from '@/database/prisma.service';
import {
  AUTH_AUDIT_MODULE,
  AUTH_AUDIT_RESOURCE,
  AuthAuditAction,
} from '@/core/auth/constants/auth-audit.constants';
import { normalizeEmail } from '@/core/auth/helpers/normalize.helper';
import { CredentialRepository } from '@/core/auth/repositories/credential.repository';
import { IdentifierRepository } from '@/core/auth/repositories/identifier.repository';
import { TwoFactorRepository } from '@/core/auth/repositories/two-factor.repository';
import { UserRepository } from '@/core/auth/repositories/user.repository';
import { TokenService } from '@/core/auth/services/token.service';
import { TwoFactorService } from '@/core/auth/services/two-factor.service';
import type { AuthTokens } from '@/core/auth/types/auth-tokens.type';
import type { AuthUser } from '@/core/auth/types/auth-user.type';
import locals from '@/locals';

type VerifiedOAuthIdentity = {
  provider: AuthProviderValue;
  providerId: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
};

export type OAuthLoginResult =
  | { kind: 'tokens'; tokens: AuthTokens; user: AuthUser }
  | {
      kind: 'two-factor';
      challengeId: string;
      methods: TwoFactorMethodTypeValue[];
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
    private readonly twoFactorRepo: TwoFactorRepository,
    private readonly twoFactor: TwoFactorService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  async loginWithGoogle(idToken: string): Promise<OAuthLoginResult> {
    const identity = await this.verifyGoogle(idToken);
    return this.loginOrCreate(identity);
  }

  async loginWithApple(idToken: string): Promise<OAuthLoginResult> {
    const identity = await this.verifyApple(idToken);
    return this.loginOrCreate(identity);
  }

  async linkGoogle(userId: string, idToken: string): Promise<void> {
    const identity = await this.verifyGoogle(idToken);
    await this.linkToUser(userId, identity);
  }

  async linkApple(userId: string, idToken: string): Promise<void> {
    const identity = await this.verifyApple(idToken);
    await this.linkToUser(userId, identity);
  }

  async unlinkGoogle(userId: string): Promise<void> {
    await this.unlinkProvider(userId, AuthProvider.GOOGLE);
  }

  async unlinkApple(userId: string): Promise<void> {
    await this.unlinkProvider(userId, AuthProvider.APPLE);
  }

  private async loginOrCreate(
    identity: VerifiedOAuthIdentity,
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

      const isAccountVerified = await this.identifiers.isAccountVerified(
        existing.id,
      );
      if (isAccountVerified) {
        const enabledMethods = await this.twoFactorRepo.findEnabledForUser(
          existing.id,
        );
        if (enabledMethods.length > 0) {
          const challenge = await this.twoFactor.issueChallenge(
            existing,
            enabledMethods,
          );
          return {
            kind: 'two-factor',
            challengeId: challenge.challengeId,
            methods: challenge.methods,
          };
        }
      }

      const tokens = await this.tokens.issue(existing.id);
      await this.audit.record({
        module: AUTH_AUDIT_MODULE,
        action: AuthAuditAction.OAUTH_LOGIN,
        userId: existing.id,
        resourceType: AUTH_AUDIT_RESOURCE.USER,
        resourceId: existing.id,
        metadata: { provider: identity.provider },
      });
      return { kind: 'tokens', tokens, user: authUser };
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
    const tokens = await this.tokens.issue(user.id);
    await this.audit.record({
      module: AUTH_AUDIT_MODULE,
      action: AuthAuditAction.OAUTH_LOGIN,
      userId: user.id,
      resourceType: AUTH_AUDIT_RESOURCE.USER,
      resourceId: user.id,
      metadata: { provider: identity.provider, created: true },
    });
    return { kind: 'tokens', tokens, user: authUser };
  }

  private async linkToUser(
    userId: string,
    identity: VerifiedOAuthIdentity,
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
      metadata: { provider: identity.provider },
    });
  }

  private async unlinkProvider(
    userId: string,
    provider: typeof AuthProvider.GOOGLE | typeof AuthProvider.APPLE,
  ): Promise<void> {
    const credential = await this.credentials.findByUserAndProvider(
      userId,
      provider,
    );
    if (!credential) {
      throw new NotFoundException(locals.auth.oauth_not_linked);
    }

    const outcome = await this.credentials.deleteOAuthIfNotLastLogin(
      userId,
      credential.id,
    );
    if (outcome === 'missing') {
      throw new NotFoundException(locals.auth.oauth_not_linked);
    }
    if (outcome === 'last') {
      throw new BadRequestException(locals.auth.cannot_unlink_last_login_method);
    }
    if (outcome === 'conflict') {
      throw new ConflictException(locals.auth.action_conflict);
    }

    await this.audit.record({
      module: AUTH_AUDIT_MODULE,
      action: AuthAuditAction.OAUTH_UNLINKED,
      userId,
      resourceType: AUTH_AUDIT_RESOURCE.USER,
      resourceId: userId,
      metadata: { provider },
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
