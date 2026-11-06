import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { normalizeEmail } from './register.dto';

/** No format rules here: any wrong email or password gives the same 401. */
export class LoginDto {
  @ApiProperty({ example: 'olena@example.com' })
  @Transform(normalizeEmail)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  email: string;

  @ApiProperty({ example: 'secret123' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  password: string;
}
