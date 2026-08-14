import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { IdentifierType } from '@prisma-client';
import { AuthProvider } from '@/core/auth/constants/auth-provider.constants';
import { PrismaService } from '@/database/prisma.service';
import {
  normalizeEmail,
  normalizePhone,
} from '@/core/auth/helpers/normalize.helper';
import { IdentifierRepository } from '@/core/auth/repositories/identifier.repository';
import { UserRepository } from '@/core/auth/repositories/user.repository';
import { EmailVerifyService } from '@/core/auth/services/email-verify.service';
import { PhoneVerifyService } from '@/core/auth/services/phone-verify.service';
import { TokenService } from '@/core/auth/services/token.service';
import {
  AUTH_AUDIT_MODULE,
  AUTH_AUDIT_RESOURCE,
  AuthAuditAction,
} from '@/core/auth/constants/auth-audit.constants';
import { AuditService } from '@/core/audit/services/audit.service';
import type { RegisterDto } from '@/core/auth/dto/request/register.dto';
import type {
  AuthTokens,
  RequestContext,
} from '@/core/auth/types/auth-tokens.type';
import type { AuthUser } from '@/core/auth/types/auth-user.type';
import { BCRYPT_ROUNDS } from '@/core/auth/auth.constants';
import locals from '@/locals';

export interface RegisterResult {
  tokens: AuthTokens;
  user: AuthUser;
}

/**
 * Creates the account, starts contact verification, and issues a session.
 * Business routes stay gated by VerifiedGuard until isAccountVerified is true.
 */
@Injectable()
export class RegisterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identifiers: IdentifierRepository,
    private readonly users: UserRepository,
    private readonly emailVerify: EmailVerifyService,
    private readonly phoneVerify: PhoneVerifyService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  async register(
    dto: RegisterDto,
    context: RequestContext = {},
  ): Promise<RegisterResult> {
    const email = dto.email ? normalizeEmail(dto.email) : undefined;
    const phone = dto.phone ? normalizePhone(dto.phone) : undefined;
    const providerId = email ?? phone;
    if (!providerId) {
      throw new BadRequestException(locals.auth.email_or_phone_required);
    }

    const [existingEmail, existingPhone] = await Promise.all([
      email
        ? this.identifiers.findByTypeValue(IdentifierType.EMAIL, email)
        : Promise.resolve(null),
      phone
        ? this.identifiers.findByTypeValue(IdentifierType.PHONE, phone)
        : Promise.resolve(null),
    ]);
    if (existingEmail) {
      throw new ConflictException(locals.auth.email_already_registered);
    }
    if (existingPhone) {
      throw new ConflictException(locals.auth.phone_already_registered);
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const identifierCreates = [
      email
        ? {
            type: IdentifierType.EMAIL,
            value: email,
            isPrimary: true,
            isVerified: false,
          }
        : null,
      phone
        ? {
            type: IdentifierType.PHONE,
            value: phone,
            isPrimary: true,
            isVerified: false,
          }
        : null,
    ].filter((row): row is NonNullable<typeof row> => row !== null);

    const user = await this.prisma.$transaction(async (tx) => {
      return tx.user.create({
        data: {
          profile: dto.name ? { create: { name: dto.name } } : undefined,
          credentials: {
            create: {
              provider: AuthProvider.EMAIL,
              providerId,
              passwordHash,
            },
          },
          identifiers: { create: identifierCreates },
        },
      });
    });

    if (email) {
      try {
        await this.emailVerify.issueAndSend(user.id, email);
      } catch {
        // logged centrally by the mailer; swallow so registration still succeeds
      }
    }
    if (phone) {
      try {
        await this.phoneVerify.issueAndSend(user.id, phone);
      } catch {
        // logged centrally by the SMS transport; swallow so registration still succeeds
      }
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
      metadata: { email, phone, isAccountVerified: false },
    });

    return { tokens, user: authUser };
  }
}
