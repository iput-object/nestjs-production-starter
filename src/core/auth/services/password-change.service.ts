import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthProvider } from '@prisma-client';
import { CredentialRepository } from '@/core/auth/repositories/credential.repository';
import { UserRepository } from '@/core/auth/repositories/user.repository';
import { TokenService } from '@/core/auth/services/token.service';
import locals from '@/locals';

const BCRYPT_ROUNDS = 12;
// Apple's Hide-My-Email relay isn't a real address the user controls — never
// pin a password credential to it (password reset would be undeliverable).
const APPLE_RELAY_DOMAIN = '@privaterelay.appleid.com';

@Injectable()
export class PasswordChangeService {
  constructor(
    private readonly credentials: CredentialRepository,
    private readonly users: UserRepository,
    private readonly tokens: TokenService,
  ) {}

  async change(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const credential = await this.credentials.findByUserAndProvider(
      userId,
      AuthProvider.EMAIL,
    );
    if (!credential || !credential.passwordHash) {
      throw new NotFoundException(locals.auth.no_password_credential);
    }

    const matches = await bcrypt.compare(
      currentPassword,
      credential.passwordHash,
    );
    if (!matches) {
      throw new UnauthorizedException(locals.auth.current_password_incorrect);
    }

    if (currentPassword === newPassword) {
      throw new UnauthorizedException(locals.auth.password_must_differ);
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.credentials.updatePasswordHash(credential.id, passwordHash);
    await this.tokens.revokeAllForUser(userId);
  }

  /**
   * Adds a password credential for an OAuth-only account so the user can
   * thereafter log in via email + password. Refuses if the user already has
   * an EMAIL credential (use `change` instead) or if their email isn't a
   * verified, deliverable address.
   */
  async set(userId: string, newPassword: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new NotFoundException(locals.auth.user_not_found);
    }
    if (!user.email || !user.isEmailVerified) {
      throw new BadRequestException(
        locals.auth.verified_email_required_for_password,
      );
    }
    if (user.email.toLowerCase().endsWith(APPLE_RELAY_DOMAIN)) {
      throw new BadRequestException(
        locals.auth.real_email_required_for_password,
      );
    }

    const existing = await this.credentials.findByUserAndProvider(
      userId,
      AuthProvider.EMAIL,
    );
    if (existing) {
      throw new ConflictException(locals.auth.password_credential_exists);
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.credentials.create({
      userId,
      provider: AuthProvider.EMAIL,
      providerId: user.email,
      passwordHash,
    });
  }
}
