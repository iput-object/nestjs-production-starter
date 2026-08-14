import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateSecret, generateURI, verifySync } from 'otplib';
import { toDataURL } from 'qrcode';
import type { User } from '@prisma-client';
import { IdentifierType } from '@prisma-client';
import { TwoFactorMethodType } from '@/core/auth/constants/two-factor-method.constants';
import { Config } from '@/configs/environment.config';
import { CryptoService } from '@/common/crypto/crypto.service';
import { IdentifierRepository } from '@/core/auth/repositories/identifier.repository';
import { TwoFactorRepository } from '@/core/auth/repositories/two-factor.repository';
import { SudoService } from '@/core/auth/services/sudo.service';
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
    private readonly identifiers: IdentifierRepository,
    @Inject(forwardRef(() => SudoService))
    private readonly sudo: SudoService,
  ) {}

  async enroll(user: User, sessionId: string): Promise<TotpEnrollmentResult> {
    await this.sudo.consumeSudo(user.id, sessionId);

    const existing = await this.twoFactor.findByUserAndType(
      user.id,
      TwoFactorMethodType.TOTP,
    );
    if (existing?.isEnabled) {
      throw new ConflictException(locals.auth.totp_already_enabled);
    }

    const totp = this.config.get<Config['totp']>('totp')!;
    const secret = generateSecret();
    const primaryEmail = await this.identifiers.findPrimary(
      user.id,
      IdentifierType.EMAIL,
    );
    const accountName = primaryEmail?.value ?? user.id;

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
