export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

// The refresh cookie is only ever read by the refresh/logout routes, so we scope
// it there instead of sending it on every request to the API.
export const REFRESH_TOKEN_COOKIE_PATH = '/api/v1/auth';

// Token delivery is mutually exclusive: clients that send this header (mobile)
// get tokens in the response body and no cookie; everyone else (web) gets the
// httpOnly cookie and no body tokens, so the web token never reaches JS.
export const AUTH_TRANSPORT_HEADER = 'X-Auth-Transport';
export const AUTH_TRANSPORT_BEARER = 'bearer';

// bcrypt cost for hashing short-lived OTP codes. Kept cheaper than password
// hashing because codes expire in minutes and are verified on a hot path.
export const AUTH_OTP_SALT = 6;
export const AUTH_OTP_CODE_LEN = 6;
export const AUTH_OTP_TOKEN_LEN = 32; // bytes of entropy for magic-link tokens

// bcrypt cost for password hashes. Do not reuse AUTH_OTP_SALT here.
export const BCRYPT_ROUNDS = 12;

// Apple Hide My Email addresses are not a durable login identity; refuse them
// when an OAuth user tries to set a password.
export const APPLE_RELAY_DOMAIN = '@privaterelay.appleid.com';

export const BACKUP_CODE_COUNT = 10;
export const BACKUP_CODE_BYTES = 5; // 5 bytes → 10 hex chars per code

/** When false, sudo guards/consume are not applied; JWT still is. */
export const SUDO_ENABLED = true;

// Used to parse JWT expiry strings like "7d" into seconds.
export const SECONDS_IN_DAY = 86_400;
