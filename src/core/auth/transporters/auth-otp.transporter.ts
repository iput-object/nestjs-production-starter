import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Config } from '@/configs/environment.config';
import { MAILER_PORT } from '@/infrastructure/mailer/mailer.constants';
import type { MailerPort } from '@/infrastructure/mailer/mailer.types';
import { SMS_PORT } from '@/infrastructure/sms/sms.constants';
import type { SmsPort } from '@/infrastructure/sms/sms.types';
import {
  GeneratedTokens,
  OtpGeneratorHelper,
  TokenType,
} from '@/core/auth/helpers/otp-generator.helper';

/**
 * The kind of auth email/SMS being sent. Drives subject + template selection.
 *
 * Values are kept in sync with `OtpPurpose` (auth-cache.service) where they
 * correspond, so a caller can pass the same constant through to the cache.
 * `WELCOME` and `CHANGE_EMAIL` have no OTP purpose of their own.
 */
export enum AuthMailType {
  WELCOME = 'welcome',
  REGISTER = 'register-verify',
  RESET_PASSWORD = 'reset-password',
  LOGIN = 'login',
  ENROLL_2FA = 'enroll-2fa',
  CHANGE_EMAIL = 'change-email',
}

export enum TransportType {
  EMAIL = 'email',
  SMS = 'sms',
}

export interface AuthOtpRecipient {
  userId: string;
  email?: string;
  phoneNumber?: string;
}

export interface AuthOtpDispatchInput {
  type: AuthMailType;
  transports: TransportType[];
  // CODE mints an OTP, TOKEN mints a magic-link secret; pass both for either.
  tokens: TokenType[];
  recipient: AuthOtpRecipient;
  expiresInMinutes?: number;
}

interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

/**
 * Centralized dispatch layer for auth OTP/links. Services own the *logic*
 * (when to send, persisting the returned hashes, TTL/policy); this just mints
 * the secrets via {@link OtpGeneratorHelper} and fans the message out across
 * the requested transports.
 *
 * It returns the {@link GeneratedTokens} so the caller can store the hashes —
 * the transporter intentionally holds no cache/state of its own.
 */
@Injectable()
export class AuthOtpTransporter {
  private readonly logger = new Logger(AuthOtpTransporter.name);

  constructor(
    private readonly otpGenerator: OtpGeneratorHelper,
    private readonly config: ConfigService<Config>,
    @Inject(MAILER_PORT) private readonly mailer: MailerPort,
    @Inject(SMS_PORT) private readonly sms: SmsPort,
  ) {}

  async dispatch(input: AuthOtpDispatchInput): Promise<GeneratedTokens> {
    const tokens = await this.otpGenerator.generate(input.tokens);

    const link = tokens.token
      ? this.buildLink(input.type, tokens.token)
      : undefined;

    await Promise.all(
      input.transports.map((transport) =>
        this.sendOn(transport, input, tokens.code, link),
      ),
    );

    return tokens;
  }

  private async sendOn(
    transport: TransportType,
    input: AuthOtpDispatchInput,
    code: string | undefined,
    link: string | undefined,
  ): Promise<void> {
    if (transport === TransportType.EMAIL) {
      if (!input.recipient.email) {
        this.logger.warn(
          `EMAIL transport requested for ${input.type} but recipient has no email`,
        );
        return;
      }
      const message = this.renderEmail(input, code, link);
      await this.mailer.send({ to: input.recipient.email, ...message });
      return;
    }

    if (transport === TransportType.SMS) {
      if (!input.recipient.phoneNumber) {
        this.logger.warn(
          `SMS transport requested for ${input.type} but recipient has no phone number`,
        );
        return;
      }
      if (!this.sms.isConfigured()) {
        this.logger.warn('SMS transport requested but SMS is not configured');
        return;
      }
      await this.sms.send({
        to: input.recipient.phoneNumber,
        body: this.renderSms(input, code, link),
      });
    }
  }

  private renderEmail(
    input: AuthOtpDispatchInput,
    code: string | undefined,
    link: string | undefined,
  ): RenderedEmail {
    const appName = this.config.get<Config['app']>('app')!.name;
    const expiry = this.expiryLine(input.expiresInMinutes);

    switch (input.type) {
      case AuthMailType.WELCOME:
        return {
          subject: `Welcome to ${appName}`,
          text: `Welcome to ${appName}! We're glad to have you.`,
          html: `<p>Welcome to <strong>${appName}</strong>! We're glad to have you.</p>`,
        };
      case AuthMailType.REGISTER:
        return {
          subject: 'Verify your email',
          text: this.join([
            link && `Verify your email: ${link}`,
            code && `Your verification code is ${code}.`,
            expiry,
          ]),
          html: this.join([
            link && `<p>Verify your email: <a href="${link}">${link}</a></p>`,
            code &&
              `<p>Your verification code is <strong>${code}</strong>.</p>`,
            expiry && `<p>${expiry}</p>`,
          ]),
        };
      case AuthMailType.RESET_PASSWORD:
        return {
          subject: 'Reset your password',
          text: this.join([
            link && `Reset your password: ${link}`,
            code && `Your reset code is ${code}.`,
            expiry,
          ]),
          html: this.join([
            link && `<p>Reset your password: <a href="${link}">${link}</a></p>`,
            code && `<p>Your reset code is <strong>${code}</strong>.</p>`,
            expiry && `<p>${expiry}</p>`,
          ]),
        };
      case AuthMailType.LOGIN:
        return {
          subject: 'Your sign-in code',
          text: this.join([
            code && `Your sign-in code is ${code}.`,
            link && `Or sign in here: ${link}`,
            expiry,
          ]),
          html: this.join([
            code && `<p>Your sign-in code is <strong>${code}</strong>.</p>`,
            link && `<p>Or sign in here: <a href="${link}">${link}</a></p>`,
            expiry && `<p>${expiry}</p>`,
          ]),
        };
      case AuthMailType.ENROLL_2FA:
        return {
          subject: 'Two-factor enrollment code',
          text: this.join([
            code && `Your two-factor enrollment code is ${code}.`,
            expiry,
          ]),
          html: this.join([
            code &&
              `<p>Your two-factor enrollment code is <strong>${code}</strong>.</p>`,
            expiry && `<p>${expiry}</p>`,
          ]),
        };
      case AuthMailType.CHANGE_EMAIL:
        return {
          subject: 'Confirm your new email',
          text: this.join([
            link && `Confirm your new email: ${link}`,
            code && `Your confirmation code is ${code}.`,
            expiry,
          ]),
          html: this.join([
            link &&
              `<p>Confirm your new email: <a href="${link}">${link}</a></p>`,
            code &&
              `<p>Your confirmation code is <strong>${code}</strong>.</p>`,
            expiry && `<p>${expiry}</p>`,
          ]),
        };
    }
  }

  private renderSms(
    input: AuthOtpDispatchInput,
    code: string | undefined,
    link: string | undefined,
  ): string {
    const expiry = this.expiryLine(input.expiresInMinutes);
    const secret = code ? `code is ${code}` : `link: ${link}`;
    switch (input.type) {
      case AuthMailType.WELCOME:
        return 'Welcome aboard!';
      case AuthMailType.REGISTER:
        return this.join([`Your verification ${secret}.`, expiry], ' ');
      case AuthMailType.RESET_PASSWORD:
        return this.join([`Your password reset ${secret}.`, expiry], ' ');
      case AuthMailType.LOGIN:
        return this.join([`Your sign-in ${secret}.`, expiry], ' ');
      case AuthMailType.ENROLL_2FA:
        return this.join(
          [`Your two-factor enrollment ${secret}.`, expiry],
          ' ',
        );
      case AuthMailType.CHANGE_EMAIL:
        return this.join(
          [`Your email change confirmation ${secret}.`, expiry],
          ' ',
        );
    }
  }

  private buildLink(type: AuthMailType, token: string): string {
    const frontendUrl = this.config
      .get<Config['app']>('app')!
      .frontendUrl.replace(/\/$/, '');
    return `${frontendUrl}/${this.linkPath(type)}?token=${token}`;
  }

  private linkPath(type: AuthMailType): string {
    switch (type) {
      case AuthMailType.RESET_PASSWORD:
        return 'reset-password';
      case AuthMailType.CHANGE_EMAIL:
        return 'confirm-email';
      case AuthMailType.LOGIN:
        return 'login';
      case AuthMailType.WELCOME:
      case AuthMailType.REGISTER:
      case AuthMailType.ENROLL_2FA:
        return 'verify-email';
    }
  }

  private expiryLine(minutes?: number): string {
    if (!minutes) {
      return '';
    }
    if (minutes % 60 === 0) {
      const hours = minutes / 60;
      return `This expires in ${hours} hour${hours > 1 ? 's' : ''}.`;
    }
    return `This expires in ${minutes} minutes.`;
  }

  private join(parts: (string | undefined | false)[], sep = '\n\n'): string {
    return parts.filter(Boolean).join(sep);
  }
}
