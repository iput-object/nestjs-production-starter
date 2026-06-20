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
