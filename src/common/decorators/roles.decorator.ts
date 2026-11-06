import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../users/user-role.enum';

export const ROLES_KEY = 'roles';

/** Roles allowed on the route; checked by RolesGuard. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
