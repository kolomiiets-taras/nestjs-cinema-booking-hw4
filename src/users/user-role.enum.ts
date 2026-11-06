export enum UserRole {
  User = 'user',
  Admin = 'admin',
}

export const USER_ROLES = Object.values(UserRole);

export function isUserRole(value: unknown): value is UserRole {
  return USER_ROLES.includes(value as UserRole);
}
