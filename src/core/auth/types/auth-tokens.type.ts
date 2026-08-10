export interface TokenPair {
  token: string;
  expiresAt: Date;
}

export interface AuthTokens {
  access: TokenPair;
  refresh: TokenPair;
}

export interface RequestContext {
  ip?: string;
  userAgent?: string;
  deviceId?: string;
  deviceLabel?: string;
}
