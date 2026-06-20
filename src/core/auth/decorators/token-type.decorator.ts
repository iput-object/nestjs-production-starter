import { SetMetadata } from '@nestjs/common';
import { JwtTokenType } from '@/core/auth/types/jwt-payload.type';

export const TOKEN_TYPE_KEY = 'token_type';
export const TokenType = (type: JwtTokenType) =>
  SetMetadata(TOKEN_TYPE_KEY, type);
