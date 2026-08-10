import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { IdentifierType } from '@prisma-client';
import { AUTH_POLICY } from '@/configs/auth.policy';
import { normalizeEmail } from '@/core/auth/helpers/normalize.helper';
import { TokenType } from '@/core/auth/helpers/otp-generator.helper';
import { IdentifierRepository } from '@/core/auth/repositories/identifier.repository';
import { UserRepository } from '@/core/auth/repositories/user.repository';
import { OtpSessionService } from '@/core/auth/services/otp-session.service';
import {
  AUTH_AUDIT_MODULE,
  AUTH_AUDIT_RESOURCE,
  AuthAuditAction,
} from '@/core/auth/constants/auth-audit.constants';
import { AuditService } from '@/common/audit/services/audit.service';
import { AuthMailType } from '@/core/auth/transporters/auth-otp.transporter';
import type { AuthUser } from '@/core/auth/types/auth-user.type';
import locals from '@/locals';

const DEFAULT_TOKENS: TokenType[] = [TokenType.CODE, TokenType.TOKEN];

@Injectable()
export class EmailVerifyService {
  constructor(
    private readonly identifiers: IdentifierRepository,
    private readonly users: UserRepository,
    private readonly otpSession: OtpSessionService,
    private readonly audit: AuditService,
  ) {}

  async issueAndSend(
    userId: string,
    email: string,
    tokens: TokenType[] = DEFAULT_TOKENS,
  ): Promise<void> {
    await this.otpSession.issue({
      userId,
      purpose: 'register-verify',
      channel: 'email',
      destination: email,
      mailType: AuthMailType.REGISTER,
      tokens,
      ttlSeconds: AUTH_POLICY.emailVerifyTtlSeconds,
    });
  }

  async issueByEmail(email: string): Promise<void> {
    const normalized = normalizeEmail(email);
    const owner = await this.identifiers.findActiveOwner(
      IdentifierType.EMAIL,
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

  /** Resend for the signed-in (possibly unverified) user. */
  async issueForUser(userId: string): Promise<void> {
    const primary = await this.identifiers.findPrimary(
      userId,
      IdentifierType.EMAIL,
    );
    if (!primary || primary.isVerified) {
      return;
    }
    await this.issueAndSend(userId, primary.value);
  }

  async confirm(token: string): Promise<AuthUser> {
    const { userId, purpose, destination } =
      await this.otpSession.verifyByToken(token);
    if (purpose !== 'register-verify') {
      throw new UnauthorizedException(
        locals.auth.verification_link_invalid_or_expired,
      );
    }
    return this.markVerified(userId, destination);
  }

  async confirmOtp(email: string, code: string): Promise<AuthUser> {
    const owner = await this.identifiers.findActiveOwner(
      IdentifierType.EMAIL,
      normalizeEmail(email),
    );
    if (!owner) {
      throw new UnauthorizedException(locals.auth.code_invalid_or_expired);
    }
    const consumed = await this.otpSession.verifyByCode(
      owner.user.id,
      'register-verify',
      code,
    );
    return this.markVerified(consumed.userId, consumed.destination);
  }

  /** Confirm with session — email comes from the primary identifier. */
  async confirmOtpForUser(userId: string, code: string): Promise<AuthUser> {
    const primary = await this.identifiers.findPrimary(
      userId,
      IdentifierType.EMAIL,
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
      'register-verify',
      code,
    );
    return this.markVerified(consumed.userId, consumed.destination);
  }

  private async markVerified(userId: string, email: string): Promise<AuthUser> {
    const identifier = await this.identifiers.findByTypeValue(
      IdentifierType.EMAIL,
      normalizeEmail(email),
    );
    if (identifier && identifier.userId === userId) {
      await this.identifiers.markVerified(identifier.id);
    }
    await this.audit.record({
      module: AUTH_AUDIT_MODULE,
      action: AuthAuditAction.EMAIL_VERIFIED,
      userId,
      resourceType: AUTH_AUDIT_RESOURCE.USER,
      resourceId: userId,
      metadata: { email },
    });

    const user = await this.users.findAuthUser(userId);
    if (!user) {
      throw new NotFoundException(locals.auth.user_not_found);
    }
    return user;
  }
}
