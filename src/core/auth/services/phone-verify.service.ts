import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { IdentifierType } from '@prisma-client';
import { normalizePhone } from '@/core/auth/helpers/normalize.helper';
import { OtpPurpose } from '@/core/auth/constants/otp-purpose.constants';
import { IdentifierRepository } from '@/core/auth/repositories/identifier.repository';
import { UserRepository } from '@/core/auth/repositories/user.repository';
import { OtpSessionService } from '@/core/auth/services/otp-session.service';
import {
  AUTH_AUDIT_MODULE,
  AUTH_AUDIT_RESOURCE,
  AuthAuditAction,
} from '@/core/auth/constants/auth-audit.constants';
import { AuditService } from '@/core/audit/services/audit.service';
import type { AuthUser } from '@/core/auth/types/auth-user.type';
import locals from '@/locals';

@Injectable()
export class PhoneVerifyService {
  constructor(
    private readonly identifiers: IdentifierRepository,
    private readonly users: UserRepository,
    private readonly otpSession: OtpSessionService,
    private readonly audit: AuditService,
  ) {}

  async issueAndSend(userId: string, phone: string): Promise<void> {
    await this.otpSession.issue({
      userId,
      purpose: OtpPurpose.REGISTER_VERIFY_PHONE,
      channel: 'sms',
      destination: phone,
    });
  }

  async issueByPhone(phone: string): Promise<void> {
    const normalized = normalizePhone(phone);
    const owner = await this.identifiers.findActiveOwner(
      IdentifierType.PHONE,
      normalized,
    );
    if (!owner || owner.identifier.isVerified) {
      return;
    }
    try {
      await this.issueAndSend(owner.user.id, normalized);
    } catch {
      // Silent: do not leak cooldown/existence via 429.
    }
  }

  async issueForUser(userId: string): Promise<void> {
    const primary = await this.identifiers.findPrimary(
      userId,
      IdentifierType.PHONE,
    );
    if (!primary || primary.isVerified) {
      return;
    }
    await this.issueAndSend(userId, primary.value);
  }

  async confirmOtp(phone: string, code: string): Promise<AuthUser> {
    const owner = await this.identifiers.findActiveOwner(
      IdentifierType.PHONE,
      normalizePhone(phone),
    );
    if (!owner) {
      throw new UnauthorizedException(locals.auth.code_invalid_or_expired);
    }
    const consumed = await this.otpSession.verifyByCode(
      owner.user.id,
      OtpPurpose.REGISTER_VERIFY_PHONE,
      'sms',
      code,
    );
    return this.markVerified(consumed.userId, consumed.destination);
  }

  async confirmOtpForUser(userId: string, code: string): Promise<AuthUser> {
    const primary = await this.identifiers.findPrimary(
      userId,
      IdentifierType.PHONE,
    );
    if (!primary) {
      throw new NotFoundException(locals.auth.user_not_found);
    }
    if (primary.isVerified) {
      const user = await this.users.findAuthUser(userId);
      if (!user) throw new NotFoundException(locals.auth.user_not_found);
      return user;
    }
    const consumed = await this.otpSession.verifyByCode(
      userId,
      OtpPurpose.REGISTER_VERIFY_PHONE,
      'sms',
      code,
    );
    return this.markVerified(consumed.userId, consumed.destination);
  }

  private async markVerified(userId: string, phone: string): Promise<AuthUser> {
    const identifier = await this.identifiers.findByTypeValue(
      IdentifierType.PHONE,
      normalizePhone(phone),
    );
    if (identifier && identifier.userId === userId) {
      await this.identifiers.markVerified(identifier.id);
    }
    await this.audit.record({
      module: AUTH_AUDIT_MODULE,
      action: AuthAuditAction.PHONE_VERIFIED,
      userId,
      resourceType: AUTH_AUDIT_RESOURCE.USER,
      resourceId: userId,
      metadata: { phone },
    });

    const user = await this.users.findAuthUser(userId);
    if (!user) {
      throw new NotFoundException(locals.auth.user_not_found);
    }
    return user;
  }
}
