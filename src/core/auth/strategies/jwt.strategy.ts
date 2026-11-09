import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { UserStatus } from '@prisma-client';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Config } from '@/configs/environment.config';
import { ACCESS_TOKEN_COOKIE } from '@/core/auth/auth.constants';
import { IdentifierRepository } from '@/core/auth/repositories/identifier.repository';
import { SessionRepository } from '@/core/auth/repositories/session.repository';
import { UserRepository } from '@/core/auth/repositories/user.repository';
import { JwtPayload } from '@/core/auth/types/jwt-payload.type';
import locals from '@/locals';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService<Config>,
    private readonly users: UserRepository,
    private readonly identifiers: IdentifierRepository,
    private readonly sessions: SessionRepository,
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

    const [user, session] = await Promise.all([
      this.users.findById(payload.sub),
      payload.sid ? this.sessions.findActiveById(payload.sid) : null,
    ]);
    if (!user || user.isDeleted || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException(locals.auth.account_no_longer_available);
    }
    if (!session || session.userId !== payload.sub) {
      throw new UnauthorizedException(locals.auth.session_expired);
    }

    const isAccountVerified = await this.identifiers.isAccountVerified(
      payload.sub,
    );

    return { ...payload, isAccountVerified };
  }
}
