import { SetMetadata } from '@nestjs/common';

export const ALLOW_UNVERIFIED_KEY = 'allow_unverified';

/**
 * Skip {@link VerifiedGuard} on an authenticated route.
 * Use for post-signup flows: sessions, logout, account status, verify, etc.
 * Email verify public endpoints do not need this.
 */
export const AllowUnverified = () => SetMetadata(ALLOW_UNVERIFIED_KEY, true);
