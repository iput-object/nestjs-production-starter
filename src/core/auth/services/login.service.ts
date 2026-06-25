import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthProvider, UserStatus } from '@prisma-client';
import { AUTH_POLICY } from '@/configs/auth.policy';
import { CryptoService } from '@/common/crypto/crypto.service';
import { format } from '@/common/utils/format.util';
import { AuthCacheService } from '@/core/auth/services/auth-cache.service';
import { TokenService } from '@/core/auth/services/token.service';
import { TwoFactorService } from '@/core/auth/services/two-factor.service';
import { CredentialRepository } from '@/core/auth/repositories/credential.repository';
import { TwoFactorRepository } from '@/core/auth/repositories/two-factor.repository';
import { UserRepository } from '@/core/auth/repositories/user.repository';
import type { LoginDto } from '@/core/auth/dto/login.dto';
import type {
  AuthTokens,
  RequestContext,
} from '@/core/auth/types/auth-tokens.type';
import type { AuthUser } from '@/core/auth/types/auth-user.type';
import type { TwoFactorMethodType } from '@prisma-client';
import locals from '@/locals';

export type LoginResult =
  | { kind: 'tokens'; tokens: AuthTokens; user: AuthUser }
  | {
      kind: 'two-factor';
      challengeId: string;
      methods: TwoFactorMethodType[];
    };

@Injectable()
export class LoginService {
  constructor(
    private readonly crypto: CryptoService,
    private readonly cache: AuthCacheService,
    private readonly users: UserRepository,
    private readonly credentials: CredentialRepository,
    private readonly twoFactorRepo: TwoFactorRepository,
    private readonly twoFactor: TwoFactorService,
    private readonly tokens: TokenService,
  ) {}

  async login(dto: LoginDto, context: RequestContext): Promise<LoginResult> {
    const emailHash = this.crypto.hashSha256(dto.email);

    const fails = await this.cache.getLoginFails(emailHash);
    if (fails >= AUTH_POLICY.loginMaxFails) {
      throw new HttpException(
        locals.auth.too_many_failed_attempts,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.users.findByEmail(dto.email);
    if (!user) {
      await this.recordFail(emailHash, fails);
      throw new UnauthorizedException(locals.auth.invalid_credentials);
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException(
        format(locals.auth.account_status, {
          status: user.status.toLowerCase(),
        }),
      );
    }

    const credential = await this.credentials.findByUserAndProvider(
      user.id,
      AuthProvider.EMAIL,
    );
    if (!credential || !credential.passwordHash) {
      await this.recordFail(emailHash, fails);
      throw new UnauthorizedException(locals.auth.invalid_credentials);
    }

    const matches = await bcrypt.compare(dto.password, credential.passwordHash);
    if (!matches) {
      await this.recordFail(emailHash, fails);
      throw new UnauthorizedException(locals.auth.invalid_credentials);
    }

    await this.cache.deleteLoginFails(emailHash);
    await this.credentials.touchLastUsed(credential.id);

    const enabledMethods = await this.twoFactorRepo.findEnabledForUser(user.id);
    if (enabledMethods.length > 0) {
      const challenge = await this.twoFactor.issueChallenge(
        user,
        enabledMethods,
        context,
      );
      return {
        kind: 'two-factor',
        challengeId: challenge.challengeId,
        methods: challenge.methods,
      };
    }

    const authUser = await this.users.findAuthUser(user.id);
    if (!authUser) {
      throw new UnauthorizedException(locals.auth.account_no_longer_available);
    }
    const tokens = await this.tokens.issue(user.id, context);
    return { kind: 'tokens', tokens, user: authUser };
  }

  private async recordFail(emailHash: string, current: number): Promise<void> {
    await this.cache.setLoginFails(
      emailHash,
      current + 1,
      AUTH_POLICY.loginLockoutTtlSeconds,
    );
  }
}
