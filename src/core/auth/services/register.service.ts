import { ConflictException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthProvider } from '@prisma-client';
import { PrismaService } from '@/database/prisma.service';
import { UserRepository } from '@/core/auth/repositories/user.repository';
import { EmailVerifyService } from '@/core/auth/services/email-verify.service';
import { TokenService } from '@/core/auth/services/token.service';
import type { RegisterDto } from '@/core/auth/dto/register.dto';
import type {
  AuthTokens,
  RequestContext,
} from '@/core/auth/types/auth-tokens.type';
import locals from '@/locals';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class RegisterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UserRepository,
    private readonly emailVerify: EmailVerifyService,
    private readonly tokens: TokenService,
  ) {}

  async register(
    dto: RegisterDto,
    context: RequestContext,
  ): Promise<AuthTokens> {
    const existing = await this.users.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException(locals.auth.email_already_registered);
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: dto.email,
          profile: dto.name ? { create: { name: dto.name } } : undefined,
          credentials: {
            create: {
              provider: AuthProvider.EMAIL,
              providerId: dto.email,
              passwordHash,
            },
          },
        },
      });
      return created;
    });

    // Best-effort: one email carries both the verification link and the code.
    // Don't fail registration if mail breaks.
    try {
      await this.emailVerify.issueAndSend(user.id, dto.email);
    } catch {
      // logged centrally by the mailer; swallow so registration still succeeds
    }

    return this.tokens.issue(user.id, context);
  }
}
