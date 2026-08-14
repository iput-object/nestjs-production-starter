import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IdentifierType } from '@prisma-client';
import { AuthProvider } from '@/core/auth/constants/auth-provider.constants';
import { OtpPurpose } from '@/core/auth/constants/otp-purpose.constants';
import { AuditService } from '@/core/audit/services/audit.service';
import {
  AUTH_AUDIT_MODULE,
  AUTH_AUDIT_RESOURCE,
  AuthAuditAction,
} from '@/core/auth/constants/auth-audit.constants';
import {
  normalizeEmail,
  normalizePhone,
} from '@/core/auth/helpers/normalize.helper';
import { CredentialRepository } from '@/core/auth/repositories/credential.repository';
import { IdentifierRepository } from '@/core/auth/repositories/identifier.repository';
import { OtpSessionService } from '@/core/auth/services/otp-session.service';
import { SudoService } from '@/core/auth/services/sudo.service';
import { TokenService } from '@/core/auth/services/token.service';
import locals from '@/locals';

@Injectable()
export class IdentifierService {
  constructor(
    private readonly identifiers: IdentifierRepository,
    private readonly credentials: CredentialRepository,
    private readonly otpSession: OtpSessionService,
    private readonly sudo: SudoService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  list(userId: string) {
    return this.identifiers.listForUser(userId);
  }

  async requestAddEmail(
    userId: string,
    sessionId: string,
    email: string,
  ): Promise<void> {
    await this.sudo.consumeSudo(userId, sessionId);
    const value = normalizeEmail(email);
    await this.assertAvailable(IdentifierType.EMAIL, value);

    await this.otpSession.issue({
      userId,
      purpose: OtpPurpose.ADD_EMAIL,
      channel: 'email',
      destination: value,
    });

    await this.audit.record({
      module: AUTH_AUDIT_MODULE,
      action: AuthAuditAction.EMAIL_CHANGE_REQUESTED,
      userId,
      resourceType: AUTH_AUDIT_RESOURCE.IDENTIFIER,
      metadata: { email: value, mode: 'add' },
    });
  }

  async confirmAddEmailByToken(token: string): Promise<void> {
    const consumed = await this.otpSession.verifyByToken(
      token,
      OtpPurpose.ADD_EMAIL,
    );
    await this.commitIdentifier(
      consumed.userId,
      IdentifierType.EMAIL,
      consumed.destination,
    );
  }

  async confirmAddEmailByOtp(userId: string, code: string): Promise<void> {
    const consumed = await this.otpSession.verifyByCode(
      userId,
      OtpPurpose.ADD_EMAIL,
      'email',
      code,
    );
    await this.commitIdentifier(
      consumed.userId,
      IdentifierType.EMAIL,
      consumed.destination,
    );
  }

  async requestAddPhone(
    userId: string,
    sessionId: string,
    phone: string,
  ): Promise<void> {
    await this.sudo.consumeSudo(userId, sessionId);
    const value = normalizePhone(phone);
    await this.assertAvailable(IdentifierType.PHONE, value);

    await this.otpSession.issue({
      userId,
      purpose: OtpPurpose.ADD_PHONE,
      channel: 'sms',
      destination: value,
    });
  }

  async confirmAddPhone(userId: string, code: string): Promise<void> {
    const consumed = await this.otpSession.verifyByCode(
      userId,
      OtpPurpose.ADD_PHONE,
      'sms',
      code,
    );
    await this.commitIdentifier(
      consumed.userId,
      IdentifierType.PHONE,
      consumed.destination,
    );
  }

  async setPrimary(
    userId: string,
    sessionId: string,
    identifierId: string,
  ): Promise<void> {
    await this.sudo.consumeSudo(userId, sessionId);
    const identifier = await this.identifiers.findById(identifierId);
    if (!identifier || identifier.userId !== userId) {
      throw new NotFoundException(locals.auth.identifier_not_found);
    }
    if (!identifier.isVerified) {
      throw new BadRequestException(locals.auth.identifier_not_verified);
    }
    if (identifier.isPrimary) {
      throw new BadRequestException(locals.auth.identifier_already_primary);
    }

    await this.identifiers.setPrimary(userId, identifierId);
    await this.syncEmailCredential(userId, identifier.type, identifier.value);
    await this.tokens.revokeAllForUser(userId);
    await this.audit.record({
      module: AUTH_AUDIT_MODULE,
      action: AuthAuditAction.IDENTIFIER_PRIMARY_CHANGED,
      userId,
      resourceType: AUTH_AUDIT_RESOURCE.IDENTIFIER,
      resourceId: identifierId,
      metadata: {
        identifierId,
        type: identifier.type,
        value: identifier.value,
      },
    });
  }

  async remove(
    userId: string,
    sessionId: string,
    identifierId: string,
  ): Promise<void> {
    await this.sudo.consumeSudo(userId, sessionId);

    const identifier = await this.identifiers.findById(identifierId);
    if (!identifier || identifier.userId !== userId) {
      throw new NotFoundException(locals.auth.identifier_not_found);
    }

    const outcome = await this.identifiers.deleteIfNotLastVerifiedRecovery(
      userId,
      identifierId,
    );
    if (outcome === 'missing') {
      throw new NotFoundException(locals.auth.identifier_not_found);
    }
    if (outcome === 'primary') {
      throw new BadRequestException(
        locals.auth.cannot_remove_primary_identifier,
      );
    }
    if (outcome === 'last') {
      throw new BadRequestException(
        locals.auth.cannot_remove_last_recovery_method,
      );
    }

    await this.audit.record({
      module: AUTH_AUDIT_MODULE,
      action: AuthAuditAction.IDENTIFIER_REMOVED,
      userId,
      resourceType: AUTH_AUDIT_RESOURCE.IDENTIFIER,
      resourceId: identifierId,
      metadata: {
        identifierId,
        type: identifier.type,
        value: identifier.value,
      },
    });
  }

  private async commitIdentifier(
    userId: string,
    type: IdentifierType,
    value: string,
  ): Promise<void> {
    await this.assertAvailable(type, value);

    const existingPrimary = await this.identifiers.findPrimary(userId, type);
    const isPrimary = !existingPrimary;

    const created = await this.identifiers.create({
      userId,
      type,
      value,
      isPrimary,
      isVerified: true,
    });

    if (isPrimary) {
      await this.syncEmailCredential(userId, type, value);
    }

    await this.audit.record({
      module: AUTH_AUDIT_MODULE,
      action:
        type === IdentifierType.EMAIL
          ? AuthAuditAction.EMAIL_ADDED
          : AuthAuditAction.PHONE_ADDED,
      userId,
      resourceType: AUTH_AUDIT_RESOURCE.IDENTIFIER,
      resourceId: created.id,
      metadata: { identifierId: created.id, value },
    });
  }

  private async syncEmailCredential(
    userId: string,
    type: IdentifierType,
    value: string,
  ): Promise<void> {
    if (type !== IdentifierType.EMAIL) {
      return;
    }
    const credential = await this.credentials.findByUserAndProvider(
      userId,
      AuthProvider.EMAIL,
    );
    if (credential && credential.providerId !== value) {
      await this.credentials.updateProviderId(credential.id, value);
    }
  }

  private async assertAvailable(
    type: IdentifierType,
    value: string,
  ): Promise<void> {
    const owner = await this.identifiers.findByTypeValue(type, value);
    if (owner) {
      throw new ConflictException(
        type === IdentifierType.EMAIL
          ? locals.auth.email_already_in_use
          : locals.auth.phone_already_in_use,
      );
    }
  }
}
