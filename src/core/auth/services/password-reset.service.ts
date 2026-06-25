import { Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthProvider } from '@prisma-client';
import { AUTH_POLICY } from '@/configs/auth.policy';
import { TokenService } from '@/core/auth/services/token.service';
import { UserRepository } from '@/core/auth/repositories/user.repository';
import { CredentialRepository } from '@/core/auth/repositories/credential.repository';
import { OtpSessionService } from '@/core/auth/services/otp-session.service';
import { TokenType } from '@/core/auth/helpers/otp-generator.helper';
import { AuthMailType } from '@/core/auth/transporters/auth-otp.transporter';

const BCRYPT_ROUNDS = 12;

/**
 * Email-only password reset. A single email carries both a magic link and an
 * OTP code (one unified challenge — consuming either invalidates the other), so
 * the client can offer link-or-code without a channel-selection round trip.
 *
 * SMS or other channels are intentionally left out of the starter; add them by
 * extending `forgot` to issue on additional channels.
 */
@Injectable()
export class PasswordResetService {
  constructor(
    private readonly users: UserRepository,
    private readonly credentials: CredentialRepository,
    private readonly tokens: TokenService,
    private readonly otpSession: OtpSessionService,
  ) {}

  /**
   * Sends a reset email if the address belongs to a verified account. Always
   * resolves silently so the endpoint never reveals whether an account exists.
   */
  async forgot(email: string): Promise<void> {
    const user = await this.users.findByEmail(email.toLowerCase());
    if (!user || !user.email || !user.isEmailVerified) {
      return;
    }

    // Email carries both the OTP code and the magic-link token in one session.
    await this.otpSession.issue({
      userId: user.id,
      purpose: 'reset-password',
      channel: 'email',
      destination: user.email,
      mailType: AuthMailType.RESET_PASSWORD,
      tokens: [TokenType.CODE, TokenType.TOKEN],
      ttlSeconds: AUTH_POLICY.passwordResetTtlSeconds,
    });
  }

  async reset(token: string, newPassword: string): Promise<void> {
    const { userId, purpose } = await this.otpSession.verifyByToken(token);
    if (purpose !== 'reset-password') {
      throw new NotFoundException('Reset link is invalid or expired');
    }
    await this.applyNewPassword(userId, newPassword);
  }

  async resetByOtp(
    email: string,
    code: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.users.findByEmail(email.toLowerCase());
    if (!user) {
      // Verify against a non-existent session yields the same generic error.
      throw new NotFoundException('Code is invalid or expired');
    }
    await this.otpSession.verifyByCode(user.id, 'reset-password', code);
    await this.applyNewPassword(user.id, newPassword);
  }

  private async applyNewPassword(
    userId: string,
    newPassword: string,
  ): Promise<void> {
    const credential = await this.credentials.findByUserAndProvider(
      userId,
      AuthProvider.EMAIL,
    );
    if (!credential) {
      throw new NotFoundException('No password credential on this account');
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.credentials.updatePasswordHash(credential.id, passwordHash);
    await this.tokens.revokeAllForUser(userId);
  }
}
