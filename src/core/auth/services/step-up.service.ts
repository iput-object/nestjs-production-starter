import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthProvider } from '@/core/auth/constants/auth-provider.constants';
import { CredentialRepository } from '@/core/auth/repositories/credential.repository';
import { TokenService } from '@/core/auth/services/token.service';
import locals from '@/locals';

/**
 * Password step-up for security-sensitive mutations (email/phone change,
 * 2FA disable, backup-code regenerate).
 */
@Injectable()
export class StepUpService {
  constructor(
    private readonly credentials: CredentialRepository,
    private readonly tokens: TokenService,
  ) {}

  async requirePassword(userId: string, password?: string): Promise<void> {
    if (!password) {
      throw new ForbiddenException(locals.auth.step_up_required);
    }

    const credential = await this.credentials.findByUserAndProvider(
      userId,
      AuthProvider.EMAIL,
    );
    if (!credential?.passwordHash) {
      throw new UnauthorizedException(locals.auth.no_password_credential);
    }

    const matches = await bcrypt.compare(password, credential.passwordHash);
    if (!matches) {
      throw new UnauthorizedException(locals.auth.step_up_password_incorrect);
    }
  }

  /**
   * Verify password and return a sudo-elevated access token.
   * The returned token has `sudo: true` and a short TTL.
   */
  async elevate(userId: string, password: string): Promise<string> {
    await this.requirePassword(userId, password);
    return this.tokens.signSudoAccessToken(userId);
  }
}
