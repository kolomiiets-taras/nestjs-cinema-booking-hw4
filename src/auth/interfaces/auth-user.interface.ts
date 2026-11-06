import type { Request } from 'express';
import { UserRole } from '../../users/user-role.enum';

/** What AuthGuard puts into request.user after checking the access token. */
export interface AuthUser {
  id: string;
  role: UserRole;
}

export type AuthRequest = Request & { user?: AuthUser };
