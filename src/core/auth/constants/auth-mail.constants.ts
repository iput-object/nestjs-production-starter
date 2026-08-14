export enum AuthMailType {
  WELCOME = 'welcome',
  REGISTER = 'register-verify',
  RESET_PASSWORD = 'reset-password',
  LOGIN = 'login',
  ENROLL_2FA = 'enroll-2fa',
  CHANGE_EMAIL = 'change-email',
  CHANGE_PHONE = 'change-phone',
  SUDO = 'sudo',
}

export enum TransportType {
  EMAIL = 'email',
  SMS = 'sms',
}
