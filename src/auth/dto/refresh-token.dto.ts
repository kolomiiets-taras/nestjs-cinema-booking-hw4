import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Body of POST /auth/refresh and POST /auth/logout. */
export class RefreshTokenDto {
  @ApiProperty({
    example: 'Jx3q0mJ2c1Vb8zK4oYt7Wn5uR9eA6dLs1fGh2iPq3rS',
    description: 'Refresh-токен, отриманий під час входу або оновлення',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  refreshToken: string;
}
