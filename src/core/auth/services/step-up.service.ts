import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthProvider } from '@/core/auth/constants/auth-provider.constants';
import { CredentialRepository } from '@/core/auth/repositories/credential.repository';
import { TokenService } from '@/core/auth/services/token.service';
import { TwoFactorRepository } from '@/core/auth/repositories/two-factor.repository';
import { TotpService } from '@/core/auth/services/totp.service';
import { OtpService } from '@/core/auth/services/otp.service';
import { TwoFactorMethodType } from '@/core/auth/constants/two-factor-method.constants';
import { SudoDto } from '@/core/auth/dto/request/sudo.dto';
import locals from '@/locals';

/**
 * Step-up authentication for security-sensitive mutations (email/phone change,
 * 2FA disable, backup-code regenerate, account deletion).
 */
@Injectable()
export class StepUpService {
  constructor(
    private readonly credentials: CredentialRepository,
    private readonly tokens: TokenService,
    private readonly twoFactor: TwoFactorRepository,
    private readonly totp: TotpService,
    private readonly otp: OtpService,
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
   * Send an OTP code for sudo authentication.
   */
  async sendSudoChallenge(userId: string, methodType: 'email_otp' | 'sms_otp'): Promise<void> {
    const type =
      methodType === 'email_otp'
        ? TwoFactorMethodType.EMAIL_OTP
        : TwoFactorMethodType.SMS_OTP;
    const methods = await this.twoFactor.findEnabledForUser(userId);
    const method = methods.find((m) => m.type === type);

    if (!method || !method.destination) {
      throw new ForbiddenException(locals.auth.method_not_available_for_challenge);
    }

    const channel = methodType === 'email_otp' ? 'email' : 'sms';
    await this.otp.send({
      channel,
      userId,
      purpose: 'sudo',
      destination: method.destination,
    });
  }

  /**
   * Verify credentials (password or OTP) and return a sudo-elevated access token.
   * The returned token has `sudo: true` and a short TTL.
   */
  async elevate(userId: string, dto: SudoDto): Promise<string> {
    if (dto.method === 'password') {
      await this.requirePassword(userId, dto.password);
    } else if (dto.method === 'totp') {
      if (!dto.code) throw new BadRequestException(locals.auth.invalid_code);
      const methods = await this.twoFactor.findEnabledForUser(userId);
      const method = methods.find((m) => m.type === TwoFactorMethodType.TOTP);

      if (!method || !method.secret) {
        throw new ForbiddenException(locals.auth.totp_enrollment_not_started);
      }
      if (!this.totp.verifyEnrolled(method.secret, dto.code)) {
        throw new UnauthorizedException(locals.auth.invalid_authenticator_code);
      }
    } else if (dto.method === 'email_otp' || dto.method === 'sms_otp') {
      if (!dto.code) throw new BadRequestException(locals.auth.invalid_code);
      const type =
        dto.method === 'email_otp'
          ? TwoFactorMethodType.EMAIL_OTP
          : TwoFactorMethodType.SMS_OTP;
      const methods = await this.twoFactor.findEnabledForUser(userId);
      const method = methods.find((m) => m.type === type);

      if (!method) {
        throw new ForbiddenException(locals.auth.method_not_available_for_challenge);
      }

      const channel = dto.method === 'email_otp' ? 'email' : 'sms';
      await this.otp.verify({
        channel,
        userId,
        purpose: 'sudo',
        code: dto.code,
      });
    } else {
      throw new BadRequestException('Invalid sudo method');
    }

    return this.tokens.signSudoAccessToken(userId);
  }
}
