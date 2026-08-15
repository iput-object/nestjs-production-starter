import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { getAuthUser } from '@/core/auth/helpers/auth-context.helper';

export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const user = getAuthUser(ctx);
    if (!data) {
      return user;
    }
    return user?.[data as keyof typeof user];
  },
);
