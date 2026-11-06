import { UserRole } from '../../users/user-role.enum';

/** Access token payload: who the user is and what role they have. */
export interface JwtPayload {
  sub: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}
