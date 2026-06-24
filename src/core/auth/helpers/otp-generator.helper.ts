import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { CryptoService } from '@/common/crypto/crypto.service';
import {
  AUTH_OTP_CODE_LEN,
  AUTH_OTP_SALT,
  AUTH_OTP_TOKEN_LEN,
} from '../auth.constants';

export enum TokenType {
  CODE = 'CODE',
  TOKEN = 'TOKEN',
}

export interface GeneratedTokens {
  code?: string;
  codeHash?: string;
  token?: string;
  tokenHash?: string;
}

@Injectable()
export class OtpGeneratorHelper {
  constructor(private readonly crypto: CryptoService) {}

  /**
   * Generates OTP codes and/or magic link tokens.
   * By keeping this logic centralized, we can separate generation from email/SMS
   * dispatching, allowing a single email to contain both a link and a code if needed.
   */
  async generate(types: TokenType[]): Promise<GeneratedTokens> {
    const result: GeneratedTokens = {};

    if (types.includes(TokenType.CODE)) {
      const code = this.crypto.randomNumericCode(AUTH_OTP_CODE_LEN);
      const codeHash = await bcrypt.hash(code, AUTH_OTP_SALT);
      result.code = code;
      result.codeHash = codeHash;
    }

    if (types.includes(TokenType.TOKEN)) {
      const token = this.crypto.randomToken(AUTH_OTP_TOKEN_LEN);
      const tokenHash = this.crypto.hashSha256(token);

      result.token = token;
      result.tokenHash = tokenHash;
    }

    return result;
  }
}
