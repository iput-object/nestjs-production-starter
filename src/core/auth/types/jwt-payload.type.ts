export type JwtTokenType = 'access' | 'refresh';

export type JwtPayload = {
  sub: string;
  tokenType: JwtTokenType;
  /** Session id for access tokens — binds sudo grants to this device. */
  sid?: string;
  /** Refreshed on each request by JwtStrategy — not a stale signed claim. */
  isAccountVerified?: boolean;
};
