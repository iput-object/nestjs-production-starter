import { BadRequestException } from '@nestjs/common';
import { AUTH_POLICY, OTP_POLICY } from '@/configs/auth.policy';
import { AuthMailType } from '@/core/auth/constants/auth-mail.constants';
import { TokenType } from '@/core/auth/helpers/otp-generator.helper';
import locals from '@/locals';

export const OtpPurpose = {
  LOGIN: 'login',
  REGISTER_VERIFY: 'register-verify',
  REGISTER_VERIFY_PHONE: 'register-verify-phone',
  RESET_PASSWORD: 'reset-password',
  ENROLL_2FA: 'enroll-2fa',
  CHANGE_EMAIL: 'change-email',
  ADD_EMAIL: 'add-email',
  ADD_PHONE: 'add-phone',
  CHANGE_PHONE: 'change-phone',
  SUDO: 'sudo',
} as const;

export type OtpPurpose = (typeof OtpPurpose)[keyof typeof OtpPurpose];

export type OtpChannel = 'email' | 'sms';

export interface OtpPurposeConfig {
  mailType: AuthMailType;
  channels: Readonly<Partial<Record<OtpChannel, readonly TokenType[]>>>;
  ttlSeconds: number;
}

export const OTP_PURPOSE_REGISTRY: Readonly<
  Record<OtpPurpose, OtpPurposeConfig>
> = Object.freeze({
  [OtpPurpose.LOGIN]: {
    mailType: AuthMailType.LOGIN,
    channels: {
      email: [TokenType.CODE],
      sms: [TokenType.CODE],
    },
    ttlSeconds: AUTH_POLICY.twoFactorChallengeTtlSeconds,
  },
  [OtpPurpose.REGISTER_VERIFY]: {
    mailType: AuthMailType.REGISTER,
    channels: {
      email: [TokenType.CODE, TokenType.TOKEN],
    },
    ttlSeconds: AUTH_POLICY.emailVerifyTtlSeconds,
  },
  [OtpPurpose.REGISTER_VERIFY_PHONE]: {
    mailType: AuthMailType.REGISTER,
    channels: {
      sms: [TokenType.CODE],
    },
    ttlSeconds: AUTH_POLICY.emailVerifyTtlSeconds,
  },
  [OtpPurpose.RESET_PASSWORD]: {
    mailType: AuthMailType.RESET_PASSWORD,
    channels: {
      email: [TokenType.CODE, TokenType.TOKEN],
      sms: [TokenType.CODE],
    },
    ttlSeconds: AUTH_POLICY.passwordResetTtlSeconds,
  },
  [OtpPurpose.ENROLL_2FA]: {
    mailType: AuthMailType.ENROLL_2FA,
    channels: {
      email: [TokenType.CODE],
      sms: [TokenType.CODE],
    },
    ttlSeconds: OTP_POLICY.emailTtlSeconds,
  },
  [OtpPurpose.CHANGE_EMAIL]: {
    mailType: AuthMailType.CHANGE_EMAIL,
    channels: {
      email: [TokenType.CODE, TokenType.TOKEN],
    },
    ttlSeconds: AUTH_POLICY.identifierChangeTtlSeconds,
  },
  [OtpPurpose.ADD_EMAIL]: {
    mailType: AuthMailType.CHANGE_EMAIL,
    channels: {
      email: [TokenType.CODE, TokenType.TOKEN],
    },
    ttlSeconds: AUTH_POLICY.identifierChangeTtlSeconds,
  },
  [OtpPurpose.ADD_PHONE]: {
    mailType: AuthMailType.CHANGE_PHONE,
    channels: {
      sms: [TokenType.CODE],
    },
    ttlSeconds: AUTH_POLICY.identifierChangeTtlSeconds,
  },
  [OtpPurpose.CHANGE_PHONE]: {
    mailType: AuthMailType.CHANGE_PHONE,
    channels: {
      sms: [TokenType.CODE],
    },
    ttlSeconds: AUTH_POLICY.identifierChangeTtlSeconds,
  },
  [OtpPurpose.SUDO]: {
    mailType: AuthMailType.SUDO,
    channels: {
      email: [TokenType.CODE],
      sms: [TokenType.CODE],
    },
    ttlSeconds: OTP_POLICY.sudoOtpTtlSeconds,
  },
});

export function tokensForPurpose(
  purpose: OtpPurpose,
  channel: OtpChannel,
): TokenType[] {
  const tokens = OTP_PURPOSE_REGISTRY[purpose].channels[channel];
  if (!tokens || tokens.length === 0) {
    throw new BadRequestException(locals.auth.otp_channel_not_supported);
  }
  return [...tokens];
}
