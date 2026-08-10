export const AuthProvider = Object.freeze({
  EMAIL: 'EMAIL',
  GOOGLE: 'GOOGLE',
  APPLE: 'APPLE',
} as const);

export type AuthProviderValue =
  (typeof AuthProvider)[keyof typeof AuthProvider];

export const AUTH_PROVIDERS = Object.values(AuthProvider);
