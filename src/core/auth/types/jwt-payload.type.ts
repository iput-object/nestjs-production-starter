export type JwtTokenType = 'access' | 'refresh';

export type JwtPayload = {
  sub: string;
  tokenType: JwtTokenType;
  /** Refreshed on each request by JwtStrategy — not a stale signed claim. */
  isAccountVerified?: boolean;
  /** True when the token was issued after a sudo re-authentication. */
  sudo?: boolean;
};
