export interface TokenPair {
  token: string;
  expiresAt: Date;
}

export interface AuthTokens {
  access: TokenPair;
  refresh: TokenPair;
}
