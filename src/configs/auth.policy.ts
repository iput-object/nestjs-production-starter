/**
 * Auth & OTP policy constants.
 *
 * These are deliberate product/security decisions, not per-environment
 * configuration. Changing them requires a code review, not a deploy-time env
 * tweak. If you ever need to vary one of these by environment (e.g. shorter
 * email-verify TTL in dev), promote it back to environment.config.ts.
 */
export const AUTH_POLICY = Object.freeze({
  loginMaxFails: 10,
  loginLockoutTtlSeconds: 900,
  passwordResetTtlSeconds: 180,
  resetRequestTtlSeconds: 600,
  emailVerifyTtlSeconds: 180,
  twoFactorChallengeTtlSeconds: 180,
});

export const OTP_POLICY = Object.freeze({
  length: 6,
  maxAttempts: 5,
  resendCooldownSeconds: 60,
  emailTtlSeconds: 180,
  smsTtlSeconds: 180,
  // Per-destination send ceiling within a rolling window (abuse / enumeration).
  maxSendsPerWindow: 5,
  sendThrottleWindowSeconds: 3600,
});
