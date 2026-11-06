import { plainToInstance } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum NodeEnvironment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

/** Access token lifetime: whole minutes, e.g. `15m`. */
export const MINUTES_TTL_PATTERN = /^[1-9]\d*m$/;
/** Refresh token lifetime: whole days, e.g. `7d`. */
export const DAYS_TTL_PATTERN = /^[1-9]\d*d$/;

export class EnvironmentVariables {
  @IsNumber()
  @Min(1)
  @Max(65535)
  PORT: number;

  @IsEnum(NodeEnvironment)
  NODE_ENV: NodeEnvironment;

  @IsString()
  @IsNotEmpty()
  POSTGRES_HOST: string;

  @IsNumber()
  @Min(1)
  @Max(65535)
  POSTGRES_PORT: number;

  @IsString()
  @IsNotEmpty()
  POSTGRES_USER: string;

  @IsString()
  @IsNotEmpty()
  POSTGRES_PASSWORD: string;

  @IsString()
  @IsNotEmpty()
  POSTGRES_DB: string;

  /** HS256 signing key of access tokens. */
  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET: string;

  @Matches(MINUTES_TTL_PATTERN, {
    message: 'JWT_ACCESS_TTL must be a number of minutes, e.g. 15m',
  })
  JWT_ACCESS_TTL: string;

  @Matches(DAYS_TTL_PATTERN, {
    message: 'JWT_REFRESH_TTL must be a number of days, e.g. 7d',
  })
  JWT_REFRESH_TTL: string;

  /** Cost factor of bcrypt; 10 when not set. */
  @IsOptional()
  @IsInt()
  @Min(4)
  @Max(15)
  BCRYPT_ROUNDS: number = 10;

  /** Administrator created by `npm run seed`. */
  @IsEmail()
  @MaxLength(255)
  ADMIN_EMAIL: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  ADMIN_PASSWORD: string;
}

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** `15m` -> milliseconds (the format is checked by validate()). */
export function minutesToMs(ttl: string): number {
  return Number.parseInt(ttl, 10) * MINUTE_MS;
}

/** `7d` -> milliseconds (the format is checked by validate()). */
export function daysToMs(ttl: string): number {
  return Number.parseInt(ttl, 10) * DAY_MS;
}

/**
 * Called by ConfigModule on startup (and by the TypeORM CLI data source):
 * the application does not start when a variable is missing or invalid.
 */
export function validate(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validatedConfig;
}
