import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { concatMap, type Observable } from 'rxjs';
import { SUDO_ENABLED } from '@/core/auth/auth.constants';
import { getAuthUser } from '@/core/auth/helpers/auth-context.helper';
import { SudoService } from '@/core/auth/services/sudo.service';

/**
 * Takes the session sudo grant after the handler succeeds.
 * Handler and pipe errors leave the grant intact. Pair with {@link SudoGuard}.
 */
@Injectable()
export class SudoConsumeInterceptor implements NestInterceptor {
  constructor(private readonly sudo: SudoService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!SUDO_ENABLED) {
      return next.handle();
    }

    const user = getAuthUser(context);

    return next.handle().pipe(
      concatMap(async (data) => {
        try {
          await this.sudo.consumeSudo(user?.sub ?? '', user?.sid);
        } catch {
          // Mutation already committed; grant may have expired or been taken.
        }
        return data;
      }),
    );
  }
}
