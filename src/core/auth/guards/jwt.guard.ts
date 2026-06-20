import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { OPTIONAL_AUTH_KEY } from '@/core/auth/decorators/optional-auth.decorator';
import { TOKEN_TYPE_KEY } from '@/core/auth/decorators/token-type.decorator';
import { JwtPayload, JwtTokenType } from '@/core/auth/types/jwt-payload.type';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  handleRequest<TUser = JwtPayload>(
    err: unknown,
    user: TUser,
    _info: unknown,
    context: ExecutionContext,
  ): TUser {
    const isOptional = this.reflector.getAllAndOverride<boolean>(
      OPTIONAL_AUTH_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (err || !user) {
      // Optional routes only tolerate the *absence* of credentials. A token that
      // was sent but failed validation (expired, malformed, bad signature) is
      // still rejected, so clients surface auth bugs instead of silently
      // degrading to anonymous.
      if (isOptional && !this.hasBearerToken(context)) {
        return undefined as TUser;
      }
      throw new UnauthorizedException();
    }

    const requiredTokenType = this.reflector.getAllAndOverride<JwtTokenType>(
      TOKEN_TYPE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredTokenType) {
      return user;
    }

    const payload = user as unknown as JwtPayload;
    if (payload.tokenType !== requiredTokenType) {
      throw new UnauthorizedException('Invalid token type for this route');
    }

    return user;
  }

  private hasBearerToken(context: ExecutionContext): boolean {
    const { authorization } =
      context
        .switchToHttp()
        .getRequest<{ headers?: { authorization?: string } }>().headers ?? {};

    return (
      typeof authorization === 'string' &&
      authorization.trim().toLowerCase().startsWith('bearer ')
    );
  }
}
