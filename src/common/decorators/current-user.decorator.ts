import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type {
  AuthRequest,
  AuthUser,
} from '../../auth/interfaces/auth-user.interface';

/**
 * The user from the access token (put into the request by AuthGuard).
 * `@CurrentUser()` gives { id, role }, `@CurrentUser('id')` gives one field.
 */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthUser | undefined, context: ExecutionContext) => {
    const user = context.switchToHttp().getRequest<AuthRequest>().user;
    return field ? user?.[field] : user;
  },
);
