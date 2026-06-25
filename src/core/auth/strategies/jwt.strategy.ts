import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Config } from '@/configs/environment.config';
import { ACCESS_TOKEN_COOKIE } from '@/core/auth/auth.constants';
import { JwtPayload } from '@/core/auth/types/jwt-payload.type';
import locals from '@/locals';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(configService: ConfigService<Config>) {
    const auth = configService.get<Config['auth']>('auth');
    super({
      // One door, two keys: mobile sends a bearer header, web sends the cookie.
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req: Request) =>
          (req?.cookies?.[ACCESS_TOKEN_COOKIE] as string | undefined) ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: auth?.jwtAccessSecret,
    });
  }

  validate(payload: JwtPayload): JwtPayload {
    if (payload.tokenType !== 'access') {
      throw new UnauthorizedException(locals.auth.access_token_required);
    }

    return payload;
  }
}
