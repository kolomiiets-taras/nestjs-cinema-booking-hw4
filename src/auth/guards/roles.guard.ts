import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../users/user-role.enum';
import { AuthRequest } from '../interfaces/auth-user.interface';

/**
 * Runs after AuthGuard (registered after it) and reads the role it put into
 * request.user. Routes without @Roles() have no role restriction.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!roles) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<AuthRequest>();
    if (!user || !roles.includes(user.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
