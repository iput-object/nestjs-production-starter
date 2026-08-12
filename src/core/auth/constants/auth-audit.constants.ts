import { AUDIT_MODULE } from '@/common/audit/constants/audit.constants';

export const AUTH_AUDIT_MODULE = AUDIT_MODULE.AUTH;

export const AuthAuditAction = Object.freeze({
  LOGIN_SUCCESS: 'login.success',
  LOGIN_FAIL: 'login.fail',
  LOGIN_LOCKOUT: 'login.lockout',
  REGISTER: 'register',
  EMAIL_VERIFIED: 'email.verified',
  PHONE_VERIFIED: 'phone.verified',
  PASSWORD_RESET: 'password.reset',
  PASSWORD_CHANGED: 'password.changed',
  PASSWORD_SET: 'password.set',
  EMAIL_CHANGE_REQUESTED: 'email.change.requested',
  EMAIL_CHANGED: 'email.changed',
  PHONE_ADDED: 'phone.added',
  EMAIL_ADDED: 'email.added',
  IDENTIFIER_REMOVED: 'identifier.removed',
  IDENTIFIER_PRIMARY_CHANGED: 'identifier.primary.changed',
  SESSION_REVOKED: 'session.revoked',
  SESSION_REVOKED_ALL: 'session.revoked_all',
  TWO_FACTOR_ENABLED: '2fa.enabled',
  TWO_FACTOR_DISABLED: '2fa.disabled',
  OAUTH_LOGIN: 'oauth.login',
  OAUTH_LINKED: 'oauth.linked',
  ACCOUNT_DEACTIVATED: 'account.deactivated',
} as const);

export type AuthAuditActionValue =
  (typeof AuthAuditAction)[keyof typeof AuthAuditAction];

export const AUTH_AUDIT_RESOURCE = Object.freeze({
  USER: 'user',
  SESSION: 'session',
  IDENTIFIER: 'identifier',
  TWO_FACTOR: 'two_factor',
} as const);
