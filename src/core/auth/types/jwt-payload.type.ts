export type JwtTokenType = 'access' | 'refresh';

export type JwtPayload = {
  sub: string;
  tokenType: JwtTokenType;
  /** Refreshed on each request by JwtStrategy — not a stale signed claim. */
  isAccountVerified?: boolean;
};
