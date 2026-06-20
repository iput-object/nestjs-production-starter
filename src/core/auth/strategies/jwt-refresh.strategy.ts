import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Config } from '@/configs/environment.config';
import { JwtPayload } from '@/core/auth/types/jwt-payload.type';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(configService: ConfigService<Config>) {
    const auth = configService.get<Config['auth']>('auth');
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: auth?.jwtRefreshSecret,
      passReqToCallback: false,
    });
  }

  validate(payload: JwtPayload): JwtPayload {
    if (payload.tokenType !== 'refresh') {
      throw new UnauthorizedException('Refresh token required');
    }

    return payload;
  }
}
