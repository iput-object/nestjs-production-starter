import {
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { AuthProvider } from '@prisma-client';
import { Config } from '@/configs/environment.config';
import { AUTH_POLICY } from '@/configs/auth.policy';
import { CryptoService } from '@/common/crypto/crypto.service';
import { MAILER_PORT } from '@/infrastructure/mailer/mailer.constants';
import type { MailerPort } from '@/infrastructure/mailer/mailer.types';
import { AuthCacheService } from '@/core/auth/services/auth-cache.service';
import { TokenService } from '@/core/auth/services/token.service';
import { UserRepository } from '@/core/auth/repositories/user.repository';
import { CredentialRepository } from '@/core/auth/repositories/credential.repository';
import { OtpService } from '@/core/auth/services/otp.service';
import { DevSecretLogger } from '@/core/auth/services/dev-secret-logger.service';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class PasswordResetService {
  constructor(
    private readonly config: ConfigService<Config>,
    private readonly crypto: CryptoService,
    private readonly cache: AuthCacheService,
    private readonly users: UserRepository,
    private readonly credentials: CredentialRepository,
    private readonly tokens: TokenService,
    private readonly otp: OtpService,
    @Inject(MAILER_PORT) private readonly mailer: MailerPort,
    private readonly devSecret: DevSecretLogger,
  ) {}

  async request(
    email: string,
    options?: { sendLink?: boolean; sendOtp?: boolean },
  ): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user) {
      // Always return success-shaped response; never disclose existence.
      return;
    }
    const sendLink = options?.sendLink ?? true;
    const sendOtp = options?.sendOtp ?? true;

    const app = this.config.get<Config['app']>('app')!;

    if (sendLink) {
      const rawToken = this.crypto.randomToken(32);
      const tokenHash = this.crypto.hashSha256(rawToken);

      await this.cache.setPasswordReset(
        tokenHash,
        { userId: user.id },
        AUTH_POLICY.passwordResetTtlSeconds,
      );

      const link = `${app.frontendUrl.replace(/\/$/, '')}/reset-password?token=${rawToken}`;
      const minutes = Math.round(AUTH_POLICY.passwordResetTtlSeconds / 60);
      this.devSecret.log('password-reset-token', rawToken, { email, link });

      try {
        await this.mailer.send({
          to: email,
          subject: 'Reset your password',
          text: `Reset your password: ${link}\n\nThis link expires in ${minutes} minutes. If you did not request this, ignore.`,
          html: `<p>Reset your password:</p><p><a href="${link}">${link}</a></p><p>This link expires in ${minutes} minutes. If you did not request this, you can safely ignore this email.</p>`,
        });
      } catch {
        // swallow to avoid leaking provider failures
      }
    }

    if (sendOtp) {
      await this.otp.send({
        channel: 'email',
        userId: user.id,
        purpose: 'reset-password',
        destination: email,
      });
    }
  }

  async reset(token: string, newPassword: string): Promise<void> {
    const tokenHash = this.crypto.hashSha256(token);
    const record = await this.cache.getPasswordReset(tokenHash);
    if (!record) {
      throw new NotFoundException('Reset link is invalid or expired');
    }

    const credential = await this.credentials.findByUserAndProvider(
      record.userId,
      AuthProvider.EMAIL,
    );
    if (!credential) {
      throw new NotFoundException('No password credential on this account');
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.credentials.updatePasswordHash(credential.id, passwordHash);
    await this.cache.deletePasswordReset(tokenHash);
    await this.tokens.revokeAllForUser(record.userId);
  }

  async resetByOtp(
    email: string,
    code: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Code is invalid or expired');
    }
    await this.otp.verify({
      channel: 'email',
      userId: user.id,
      purpose: 'reset-password',
      code,
    });

    const credential = await this.credentials.findByUserAndProvider(
      user.id,
      AuthProvider.EMAIL,
    );
    if (!credential) {
      throw new NotFoundException('No password credential on this account');
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.credentials.updatePasswordHash(credential.id, passwordHash);
    await this.tokens.revokeAllForUser(user.id);
  }
}
