import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../users/user-role.enum';

/** Response of GET /auth/me. */
export class CurrentUserDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'olena@example.com' })
  email: string;

  @ApiProperty({ enum: UserRole, example: UserRole.User })
  role: UserRole;
}
