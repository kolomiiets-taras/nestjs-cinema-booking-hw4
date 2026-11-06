import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export const normalizeEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/**
 * Only email and password are read. Any other field (e.g. `role`) is dropped
 * by the global ValidationPipe (whitelist), so a new account is always a user.
 */
export class RegisterDto {
  @ApiProperty({
    example: 'olena@example.com',
    maxLength: 255,
    description: 'Пошта; зберігається в нижньому регістрі',
  })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({
    example: 'secret123',
    minLength: 8,
    maxLength: 72,
    description: 'Пароль від 8 символів (bcrypt враховує не більше 72 байтів)',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;
}
