import { ApiProperty } from '@nestjs/swagger';

export class TokenPairDto {
  @ApiProperty({
    description:
      'JWT (HS256) з полями sub (id користувача) і role; передається в заголовку Authorization: Bearer',
  })
  accessToken: string;

  @ApiProperty({
    description:
      'Випадковий рядок (не JWT) для POST /auth/refresh і POST /auth/logout; одноразовий',
  })
  refreshToken: string;
}
