import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthProvider } from '@prisma-client';
import { Config } from '@/configs/environment.config';
import { AUTH_POLICY } from '@/configs/auth.policy';
import { CryptoService } from '@/common/crypto/crypto.service';
import { MAILER_PORT } from '@/infrastructure/mailer/mailer.constants';
import type { MailerPort } from '@/infrastructure/mailer/mailer.types';
import { AuthCacheService } from '@/core/auth/services/auth-cache.service';
import { OtpService } from '@/core/auth/services/otp.service';
import { CredentialRepository } from '@/core/auth/repositories/credential.repository';
import { UserRepository } from '@/core/auth/repositories/user.repository';
import locals from '@/locals';

@Injectable()
export class ChangeContactService {
  constructor(
    private readonly config: ConfigService<Config>,
    private readonly crypto: CryptoService,
    private readonly cache: AuthCacheService,
    private readonly users: UserRepository,
    private readonly credentials: CredentialRepository,
    private readonly otp: OtpService,
    @Inject(MAILER_PORT) private readonly mailer: MailerPort,
  ) {}

  // ---------- Email ----------
  async requestEmailChange(userId: string, newEmail: string): Promise<void> {
    const owner = await this.users.findByEmail(newEmail);
    if (owner && owner.id !== userId) {
      throw new ConflictException(locals.auth.email_already_in_use);
    }

    const app = this.config.get<Config['app']>('app')!;

    const rawToken = this.crypto.randomToken(32);
    const tokenHash = this.crypto.hashSha256(rawToken);

    await this.cache.setEmailVerify(
      tokenHash,
      { userId, email: newEmail },
      AUTH_POLICY.emailVerifyTtlSeconds,
    );

    const link = `${app.frontendUrl.replace(/\/$/, '')}/verify-email?token=${rawToken}`;
    const hours = Math.round(AUTH_POLICY.emailVerifyTtlSeconds / 3600);
    await this.mailer.send({
      to: newEmail,
      subject: 'Confirm your new email',
      text: `Click to confirm your new email: ${link}\n\nExpires in ${hours}h.`,
      html: `<p>Click to confirm your new email:</p><p><a href="${link}">${link}</a></p><p>Expires in ${hours}h.</p>`,
    });
  }

  async confirmEmailChange(
    token: string,
  ): Promise<{ userId: string; email: string }> {
    const tokenHash = this.crypto.hashSha256(token);
    const record = await this.cache.getEmailVerify(tokenHash);
    if (!record) {
      throw new NotFoundException(
        locals.auth.confirmation_link_invalid_or_expired,
      );
    }

    const owner = await this.users.findByEmail(record.email);
    if (owner && owner.id !== record.userId) {
      throw new ConflictException(locals.auth.email_already_in_use);
    }

    const updated = await this.users.updateEmail(record.userId, record.email);
    await this.users.markEmailVerified(record.userId);

    // Keep EMAIL credential providerId in sync if present.
    const credential = await this.credentials.findByUserAndProvider(
      record.userId,
      AuthProvider.EMAIL,
    );
    if (credential && credential.providerId !== record.email) {
      await this.credentials.updateProviderId(credential.id, record.email);
    }

    await this.cache.deleteEmailVerify(tokenHash);
    return { userId: updated.id, email: record.email };
  }

  // ---------- Phone ----------
  async requestPhoneChange(userId: string, newPhone: string): Promise<void> {
    const owner = await this.users.findByPhone(newPhone);
    if (owner && owner.id !== userId) {
      throw new ConflictException(locals.auth.phone_already_in_use);
    }
    await this.users.updatePhone(userId, newPhone);
    await this.otp.send({
      channel: 'sms',
      userId,
      purpose: 'register-verify',
      destination: newPhone,
    });
  }

  async confirmPhoneChange(userId: string, code: string): Promise<void> {
    await this.otp.verify({
      channel: 'sms',
      userId,
      purpose: 'register-verify',
      code,
    });
    await this.users.markPhoneVerified(userId);
  }
}
