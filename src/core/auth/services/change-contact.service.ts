import {
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { IdentifierType } from '@prisma-client';
import { AuthProvider } from '@/core/auth/constants/auth-provider.constants';
import { OtpPurpose } from '@/core/auth/constants/otp-purpose.constants';
import { TwoFactorMethodType } from '@/core/auth/constants/two-factor-method.constants';
import { MAILER_PORT } from '@/infrastructure/mailer/mailer.constants';
import type { MailerPort } from '@/infrastructure/mailer/mailer.types';
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
import { TwoFactorRepository } from '@/core/auth/repositories/two-factor.repository';
import { OtpSessionService } from '@/core/auth/services/otp-session.service';
import { TokenService } from '@/core/auth/services/token.service';
import locals from '@/locals';

@Injectable()
export class ChangeContactService {
  constructor(
    private readonly credentials: CredentialRepository,
    private readonly identifiers: IdentifierRepository,
    private readonly twoFactor: TwoFactorRepository,
    private readonly otpSession: OtpSessionService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    @Inject(MAILER_PORT) private readonly mailer: MailerPort,
  ) {}

  async requestEmailChange(userId: string, newEmail: string): Promise<void> {
    const email = normalizeEmail(newEmail);
    const owner = await this.identifiers.findByTypeValue(
      IdentifierType.EMAIL,
      email,
    );
    if (owner && owner.userId !== userId) {
      throw new ConflictException(locals.auth.email_already_in_use);
    }

    const primary = await this.identifiers.findPrimary(
      userId,
      IdentifierType.EMAIL,
    );

    await this.otpSession.issue({
      userId,
      purpose: OtpPurpose.CHANGE_EMAIL,
      channel: 'email',
      destination: email,
    });

    if (primary?.value) {
      await this.notifyOldEmail(primary.value, email);
    }

    await this.audit.record({
      module: AUTH_AUDIT_MODULE,
      action: AuthAuditAction.EMAIL_CHANGE_REQUESTED,
      userId,
      resourceType: AUTH_AUDIT_RESOURCE.IDENTIFIER,
      metadata: { email },
    });
  }

  async confirmEmailChange(
    token: string,
  ): Promise<{ userId: string; email: string }> {
    const consumed = await this.otpSession.verifyByToken(
      token,
      OtpPurpose.CHANGE_EMAIL,
    );
    return this.applyEmailChange(consumed.userId, consumed.destination);
  }

  async confirmEmailChangeByOtp(
    userId: string,
    code: string,
  ): Promise<{ userId: string; email: string }> {
    const consumed = await this.otpSession.verifyByCode(
      userId,
      OtpPurpose.CHANGE_EMAIL,
      'email',
      code,
    );
    return this.applyEmailChange(consumed.userId, consumed.destination);
  }

  async requestPhoneChange(userId: string, newPhone: string): Promise<void> {
    const phone = normalizePhone(newPhone);
    const owner = await this.identifiers.findByTypeValue(
      IdentifierType.PHONE,
      phone,
    );
    if (owner && owner.userId !== userId) {
      throw new ConflictException(locals.auth.phone_already_in_use);
    }

    await this.otpSession.issue({
      userId,
      purpose: OtpPurpose.CHANGE_PHONE,
      channel: 'sms',
      destination: phone,
    });

    await this.audit.record({
      module: AUTH_AUDIT_MODULE,
      action: AuthAuditAction.PHONE_ADDED,
      userId,
      resourceType: AUTH_AUDIT_RESOURCE.IDENTIFIER,
      metadata: { phone, mode: 'change-request' },
    });
  }

  async confirmPhoneChange(userId: string, code: string): Promise<void> {
    const consumed = await this.otpSession.verifyByCode(
      userId,
      OtpPurpose.CHANGE_PHONE,
      'sms',
      code,
    );
    await this.applyPhoneChange(consumed.userId, consumed.destination);
  }

  private async applyEmailChange(
    userId: string,
    email: string,
  ): Promise<{ userId: string; email: string }> {
    const owner = await this.identifiers.findByTypeValue(
      IdentifierType.EMAIL,
      email,
    );
    if (owner && owner.userId !== userId) {
      throw new ConflictException(locals.auth.email_already_in_use);
    }

    const primary = await this.identifiers.findPrimary(
      userId,
      IdentifierType.EMAIL,
    );
    if (primary) {
      if (primary.value !== email) {
        await this.identifiers.delete(primary.id);
        await this.identifiers.create({
          userId,
          type: IdentifierType.EMAIL,
          value: email,
          isPrimary: true,
          isVerified: true,
        });
      } else {
        await this.identifiers.markVerified(primary.id);
      }
    } else {
      await this.identifiers.create({
        userId,
        type: IdentifierType.EMAIL,
        value: email,
        isPrimary: true,
        isVerified: true,
      });
    }

    const credential = await this.credentials.findByUserAndProvider(
      userId,
      AuthProvider.EMAIL,
    );
    if (credential && credential.providerId !== email) {
      await this.credentials.updateProviderId(credential.id, email);
    }

    await this.syncTwoFactorDestination(
      userId,
      TwoFactorMethodType.EMAIL_OTP,
      email,
    );

    await this.tokens.revokeAllForUser(userId);
    await this.audit.record({
      module: AUTH_AUDIT_MODULE,
      action: AuthAuditAction.EMAIL_CHANGED,
      userId,
      resourceType: AUTH_AUDIT_RESOURCE.IDENTIFIER,
      metadata: { email },
    });

    return { userId, email };
  }

  private async applyPhoneChange(userId: string, phone: string): Promise<void> {
    const owner = await this.identifiers.findByTypeValue(
      IdentifierType.PHONE,
      phone,
    );
    if (owner && owner.userId !== userId) {
      throw new ConflictException(locals.auth.phone_already_in_use);
    }

    const primary = await this.identifiers.findPrimary(
      userId,
      IdentifierType.PHONE,
    );
    if (primary) {
      if (primary.value !== phone) {
        await this.identifiers.delete(primary.id);
        await this.identifiers.create({
          userId,
          type: IdentifierType.PHONE,
          value: phone,
          isPrimary: true,
          isVerified: true,
        });
      } else {
        await this.identifiers.markVerified(primary.id);
      }
    } else {
      await this.identifiers.create({
        userId,
        type: IdentifierType.PHONE,
        value: phone,
        isPrimary: true,
        isVerified: true,
      });
    }

    await this.syncTwoFactorDestination(
      userId,
      TwoFactorMethodType.SMS_OTP,
      phone,
    );

    await this.tokens.revokeAllForUser(userId);
    await this.audit.record({
      module: AUTH_AUDIT_MODULE,
      action: AuthAuditAction.PHONE_ADDED,
      userId,
      resourceType: AUTH_AUDIT_RESOURCE.IDENTIFIER,
      metadata: { phone, mode: 'change-confirm' },
    });
  }

  /**
   * Keep enrolled email/SMS 2FA pointed at a live account identifier after a
   * primary contact change. If the stored destination is no longer verified on
   * the account, retarget it to the new primary.
   */
  private async syncTwoFactorDestination(
    userId: string,
    type:
      | typeof TwoFactorMethodType.EMAIL_OTP
      | typeof TwoFactorMethodType.SMS_OTP,
    newDestination: string,
  ): Promise<void> {
    const method = await this.twoFactor.findByUserAndType(userId, type);
    if (!method?.isEnabled) {
      return;
    }

    const verified = await this.identifiers.listVerifiedForUser(userId);
    const stillValid = verified.some(
      (row) => row.value === method.destination,
    );
    if (stillValid) {
      return;
    }

    await this.twoFactor.updateDestination(method.id, newDestination);
  }

  private async notifyOldEmail(
    oldEmail: string,
    newEmail: string,
  ): Promise<void> {
    try {
      await this.mailer.send({
        to: oldEmail,
        subject: 'Your email address change was requested',
        text: `A request was made to change your account email to ${newEmail}. If this was not you, sign in and secure your account immediately.`,
        html: `<p>A request was made to change your account email to <strong>${newEmail}</strong>.</p><p>If this was not you, sign in and secure your account immediately.</p>`,
      });
    } catch {
      // Non-fatal: confirmation to the new address is the source of truth.
    }
  }
}
