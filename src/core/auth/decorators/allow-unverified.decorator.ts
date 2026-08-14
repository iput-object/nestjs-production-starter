import { SetMetadata } from '@nestjs/common';

export const ALLOW_UNVERIFIED_KEY = 'allow_unverified';

/**
 * Skip the account-verification check in {@link JwtAuthGuard}.
 * Use for post-signup flows: sessions, logout, account status, verify, etc.
 * Public endpoints (no auth) do not need this.
 */
export const AllowUnverified = () => SetMetadata(ALLOW_UNVERIFIED_KEY, true);
