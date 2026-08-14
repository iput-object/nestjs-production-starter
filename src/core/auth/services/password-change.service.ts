import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { IdentifierType } from '@prisma-client';
import { AuthProvider } from '@/core/auth/constants/auth-provider.constants';
import { AuditService } from '@/core/audit/services/audit.service';
import {
  AUTH_AUDIT_MODULE,
  AUTH_AUDIT_RESOURCE,
  AuthAuditAction,
} from '@/core/auth/constants/auth-audit.constants';
import { CredentialRepository } from '@/core/auth/repositories/credential.repository';
import { IdentifierRepository } from '@/core/auth/repositories/identifier.repository';
import { UserRepository } from '@/core/auth/repositories/user.repository';
import { TokenService } from '@/core/auth/services/token.service';
import { BCRYPT_ROUNDS, APPLE_RELAY_DOMAIN } from '@/core/auth/auth.constants';
import locals from '@/locals';

@Injectable()
export class PasswordChangeService {
  constructor(
    private readonly credentials: CredentialRepository,
    private readonly users: UserRepository,
    private readonly identifiers: IdentifierRepository,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
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
    await this.audit.record({
      module: AUTH_AUDIT_MODULE,
      action: AuthAuditAction.PASSWORD_CHANGED,
      userId,
      resourceType: AUTH_AUDIT_RESOURCE.USER,
      resourceId: userId,
    });
  }

  async set(userId: string, newPassword: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new NotFoundException(locals.auth.user_not_found);
    }

    const primaryEmail = await this.identifiers.findPrimary(
      userId,
      IdentifierType.EMAIL,
    );
    if (!primaryEmail || !primaryEmail.isVerified) {
      throw new BadRequestException(
        locals.auth.verified_email_required_for_password,
      );
    }
    if (primaryEmail.value.toLowerCase().endsWith(APPLE_RELAY_DOMAIN)) {
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
      providerId: primaryEmail.value,
      passwordHash,
    });
    await this.audit.record({
      module: AUTH_AUDIT_MODULE,
      action: AuthAuditAction.PASSWORD_SET,
      userId,
      resourceType: AUTH_AUDIT_RESOURCE.USER,
      resourceId: userId,
    });
  }
}
