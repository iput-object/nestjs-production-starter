import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { UserStatus } from '@prisma-client';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Config } from '@/configs/environment.config';
import { ACCESS_TOKEN_COOKIE } from '@/core/auth/auth.constants';
import { IdentifierRepository } from '@/core/auth/repositories/identifier.repository';
import { UserRepository } from '@/core/auth/repositories/user.repository';
import { JwtPayload } from '@/core/auth/types/jwt-payload.type';
import locals from '@/locals';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService<Config>,
    private readonly users: UserRepository,
    private readonly identifiers: IdentifierRepository,
  ) {
    const auth = configService.get<Config['auth']>('auth');
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req: Request) =>
          (req?.cookies?.[ACCESS_TOKEN_COOKIE] as string | undefined) ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: auth?.jwtAccessSecret as string,
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    if (payload.tokenType !== 'access') {
      throw new UnauthorizedException(locals.auth.access_token_required);
    }

    const user = await this.users.findById(payload.sub);
    if (!user || user.isDeleted || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException(locals.auth.account_no_longer_available);
    }

    const isAccountVerified = await this.identifiers.isAccountVerified(
      payload.sub,
    );

    return { ...payload, isAccountVerified };
  }
}
