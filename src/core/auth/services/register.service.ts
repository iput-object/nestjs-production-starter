import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { IdentifierType } from '@prisma-client';
import { AuthProvider } from '@/core/auth/constants/auth-provider.constants';
import { PrismaService } from '@/database/prisma.service';
import { normalizeEmail } from '@/core/auth/helpers/normalize.helper';
import { IdentifierRepository } from '@/core/auth/repositories/identifier.repository';
import { UserRepository } from '@/core/auth/repositories/user.repository';
import { EmailVerifyService } from '@/core/auth/services/email-verify.service';
import { TokenService } from '@/core/auth/services/token.service';
import {
  AUTH_AUDIT_MODULE,
  AUTH_AUDIT_RESOURCE,
  AuthAuditAction,
} from '@/core/auth/constants/auth-audit.constants';
import { AuditService } from '@/common/audit/services/audit.service';
import type { RegisterDto } from '@/core/auth/dto/register.dto';
import type {
  AuthTokens,
  RequestContext,
} from '@/core/auth/types/auth-tokens.type';
import type { AuthUser } from '@/core/auth/types/auth-user.type';
import locals from '@/locals';

const BCRYPT_ROUNDS = 12;

export interface RegisterResult {
  tokens: AuthTokens;
  user: AuthUser;
}

/**
 * Creates the account, starts email verification, and issues a session.
 * Business routes stay gated by VerifiedGuard until isAccountVerified is true.
 */
@Injectable()
export class RegisterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identifiers: IdentifierRepository,
    private readonly users: UserRepository,
    private readonly emailVerify: EmailVerifyService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  async register(
    dto: RegisterDto,
    context: RequestContext = {},
  ): Promise<RegisterResult> {
    const email = normalizeEmail(dto.email);

    const existingIdentifier = await this.identifiers.findByTypeValue(
      IdentifierType.EMAIL,
      email,
    );
    if (existingIdentifier) {
      throw new ConflictException(locals.auth.email_already_registered);
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await this.prisma.$transaction(async (tx) => {
      return tx.user.create({
        data: {
          profile: dto.name ? { create: { name: dto.name } } : undefined,
          credentials: {
            create: {
              provider: AuthProvider.EMAIL,
              providerId: email,
              passwordHash,
            },
          },
          identifiers: {
            create: {
              type: IdentifierType.EMAIL,
              value: email,
              isPrimary: true,
              isVerified: false,
            },
          },
        },
      });
    });

    try {
      await this.emailVerify.issueAndSend(user.id, email);
    } catch {
      // logged centrally by the mailer; swallow so registration still succeeds
    }

    const authUser = await this.users.findAuthUser(user.id);
    if (!authUser) {
      throw new UnauthorizedException(locals.auth.account_no_longer_available);
    }

    const tokens = await this.tokens.issue(user.id, context);

    await this.audit.record({
      module: AUTH_AUDIT_MODULE,
      action: AuthAuditAction.REGISTER,
      userId: user.id,
      resourceType: AUTH_AUDIT_RESOURCE.USER,
      resourceId: user.id,
      context,
      metadata: { email, isAccountVerified: false },
    });

    return { tokens, user: authUser };
  }
}
