import {
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Config } from '@/configs/environment.config';
import { AUTH_POLICY } from '@/configs/auth.policy';
import { CryptoService } from '@/common/crypto/crypto.service';
import { MAILER_PORT } from '@/infrastructure/mailer/mailer.constants';
import type { MailerPort } from '@/infrastructure/mailer/mailer.types';
import { AuthCacheService } from '@/core/auth/services/auth-cache.service';
import { UserRepository } from '@/core/auth/repositories/user.repository';
import { OtpService } from '@/core/auth/services/otp.service';
import { DevSecretLogger } from '@/core/auth/services/dev-secret-logger.service';

@Injectable()
export class EmailVerifyService {
  constructor(
    private readonly config: ConfigService<Config>,
    private readonly crypto: CryptoService,
    private readonly cache: AuthCacheService,
    private readonly users: UserRepository,
    private readonly otp: OtpService,
    @Inject(MAILER_PORT) private readonly mailer: MailerPort,
    private readonly devSecret: DevSecretLogger,
  ) {}

  async issueAndSend(userId: string, email: string): Promise<void> {
    const app = this.config.get<Config['app']>('app')!;

    const rawToken = this.crypto.randomToken(32);
    const tokenHash = this.crypto.hashSha256(rawToken);

    await this.cache.setEmailVerify(
      tokenHash,
      { userId, email },
      AUTH_POLICY.emailVerifyTtlSeconds,
    );

    const hours = Math.round(AUTH_POLICY.emailVerifyTtlSeconds / 3600);
    const link = `${app.frontendUrl.replace(/\/$/, '')}/verify-email?token=${rawToken}`;
    this.devSecret.log('email-verify-token', rawToken, { email, link });
    await this.mailer.send({
      to: email,
      subject: 'Verify your email',
      text: `Click to verify your email: ${link}\n\nThis link expires in ${hours}h.`,
      html: `<p>Click to verify your email:</p><p><a href="${link}">${link}</a></p><p>This link expires in ${hours}h.</p>`,
    });
  }

  async confirm(token: string): Promise<void> {
    const tokenHash = this.crypto.hashSha256(token);
    const record = await this.cache.getEmailVerify(tokenHash);
    if (!record) {
      throw new NotFoundException('Verification link is invalid or expired');
    }

    await this.users.markEmailVerified(record.userId);
    await this.cache.deleteEmailVerify(tokenHash);
  }

  async issueOtpByEmail(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user || user.isEmailVerified) {
      return;
    }
    await this.otp.send({
      channel: 'email',
      userId: user.id,
      purpose: 'register-verify',
      destination: email,
    });
  }

  async confirmOtp(email: string, code: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Code is invalid or expired');
    }
    await this.otp.verify({
      channel: 'email',
      userId: user.id,
      purpose: 'register-verify',
      code,
    });
    await this.users.markEmailVerified(user.id);
  }
}
