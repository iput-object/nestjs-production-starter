export const TwoFactorMethodType = Object.freeze({
  TOTP: 'TOTP',
  EMAIL_OTP: 'EMAIL_OTP',
  SMS_OTP: 'SMS_OTP',
} as const);

export type TwoFactorMethodTypeValue =
  (typeof TwoFactorMethodType)[keyof typeof TwoFactorMethodType];

export const TWO_FACTOR_METHOD_TYPES = Object.values(TwoFactorMethodType);
