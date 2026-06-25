import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateSecret, generateURI, verifySync } from 'otplib';
import { toDataURL } from 'qrcode';
import type { User } from '@prisma-client';
import { TwoFactorMethodType } from '@prisma-client';
import { Config } from '@/configs/environment.config';
import { CryptoService } from '@/common/crypto/crypto.service';
import { TwoFactorRepository } from '@/core/auth/repositories/two-factor.repository';
import locals from '@/locals';

export interface TotpEnrollmentResult {
  methodId: string;
  secret: string; // encoded for the auth app, NOT the encrypted form
  otpauthUrl: string;
  qrDataUrl: string;
}

@Injectable()
export class TotpService {
  constructor(
    private readonly config: ConfigService<Config>,
    private readonly crypto: CryptoService,
    private readonly twoFactor: TwoFactorRepository,
  ) {}

  async enroll(user: User): Promise<TotpEnrollmentResult> {
    const totp = this.config.get<Config['totp']>('totp')!;
    const secret = generateSecret();
    const accountName = user.email ?? user.id;

    const encryptedSecret = this.crypto.encrypt(secret);
    const method = await this.twoFactor.upsert({
      userId: user.id,
      type: TwoFactorMethodType.TOTP,
      secret: encryptedSecret,
    });

    const otpauthUrl = generateURI({
      issuer: totp.issuer,
      label: accountName,
      secret,
      strategy: 'totp',
    });
    const qrDataUrl = await toDataURL(otpauthUrl);

    return {
      methodId: method.id,
      secret,
      otpauthUrl,
      qrDataUrl,
    };
  }

  async confirm(userId: string, code: string): Promise<void> {
    const method = await this.twoFactor.findByUserAndType(
      userId,
      TwoFactorMethodType.TOTP,
    );
    if (!method || !method.secret) {
      throw new NotFoundException(locals.auth.totp_enrollment_not_started);
    }
    if (method.isEnabled) {
      throw new ConflictException(locals.auth.totp_already_enabled);
    }

    if (!this.verifyCode(method.secret, code)) {
      throw new UnauthorizedException(locals.auth.invalid_authenticator_code);
    }

    await this.twoFactor.enable(method.id);
  }

  verifyEnrolled(methodSecretCiphertext: string, code: string): boolean {
    return this.verifyCode(methodSecretCiphertext, code);
  }

  private verifyCode(secretCiphertext: string, code: string): boolean {
    const totp = this.config.get<Config['totp']>('totp')!;
    const secret = this.crypto.decrypt(secretCiphertext);
    const result = verifySync({
      strategy: 'totp',
      token: code,
      secret,
      epochTolerance: totp.window * 30,
    });
    return result.valid;
  }
}
