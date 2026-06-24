import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AUTH_POLICY } from '@/configs/auth.policy';
import { UserRepository } from '@/core/auth/repositories/user.repository';
import { OtpSessionService } from '@/core/auth/services/otp-session.service';
import { TokenType } from '@/core/auth/helpers/otp-generator.helper';
import { AuthMailType } from '@/core/auth/transporters/auth-otp.transporter';

const DEFAULT_TOKENS: TokenType[] = [TokenType.CODE, TokenType.TOKEN];

@Injectable()
export class EmailVerifyService {
  constructor(
    private readonly users: UserRepository,
    private readonly otpSession: OtpSessionService,
  ) {}

  /**
   * Sends a single email carrying a magic link and/or a 6-digit code (caller
   * picks which via the tokens array). Both are backed by one challenge — using
   * either verifies the email and kills the other.
   */
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
    const user = await this.users.findByEmail(email);
    if (!user || user.isEmailVerified) {
      return;
    }
    await this.issueAndSend(user.id, email);
  }

  async confirm(token: string): Promise<void> {
    const { userId, purpose } = await this.otpSession.verifyByToken(token);
    if (purpose !== 'register-verify') {
      throw new UnauthorizedException(
        'Verification link is invalid or expired',
      );
    }
    await this.users.markEmailVerified(userId);
  }

  async confirmOtp(email: string, code: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Code is invalid or expired');
    }
    await this.otpSession.verifyByCode(user.id, 'register-verify', code);
    await this.users.markEmailVerified(user.id);
  }
}
