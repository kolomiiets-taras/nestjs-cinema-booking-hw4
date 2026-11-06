import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import {
  PG_UNIQUE_VIOLATION,
  isDatabaseError,
} from '../common/database-errors';
import { EnvironmentVariables } from '../config/environment-variables';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { CurrentUserDto } from './dto/current-user.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { TokenPairDto } from './dto/token-pair.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { RefreshTokensService } from './refresh-tokens.service';

/** One message for an unknown email and a wrong password. */
const INVALID_CREDENTIALS = 'Invalid email or password';

@Injectable()
export class AuthService {
  private readonly bcryptRounds: number;
  /** Compared against when the email is unknown, so both cases take the same time. */
  private readonly dummyHash: Promise<string>;

  constructor(
    private readonly usersService: UsersService,
    private readonly refreshTokensService: RefreshTokensService,
    private readonly jwtService: JwtService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.bcryptRounds = config.get('BCRYPT_ROUNDS', { infer: true });
    this.dummyHash = bcrypt.hash(
      randomBytes(16).toString('hex'),
      this.bcryptRounds,
    );
  }

  async register(dto: RegisterDto): Promise<User> {
    if (await this.usersService.existsByEmail(dto.email)) {
      throw this.duplicateEmailConflict();
    }
    const passwordHash = await bcrypt.hash(dto.password, this.bcryptRounds);
    try {
      return await this.usersService.create(dto.email, passwordHash);
    } catch (error) {
      // Two registrations with the same email at the same time: the unique constraint decides.
      if (isDatabaseError(error, PG_UNIQUE_VIOLATION)) {
        throw this.duplicateEmailConflict();
      }
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<TokenPairDto> {
    const user = await this.usersService.findByEmail(dto.email);
    const passwordMatches = await bcrypt.compare(
      dto.password,
      user?.passwordHash ?? (await this.dummyHash),
    );
    if (!user || !passwordMatches) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    return this.issueTokens(user);
  }

  /** The old refresh token is consumed; the role is read from the database again. */
  async refresh(refreshToken: string): Promise<TokenPairDto> {
    const userId = await this.refreshTokensService.consume(refreshToken);
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }
    return this.issueTokens(user);
  }

  logout(userId: string, refreshToken: string): Promise<void> {
    return this.refreshTokensService.revoke(userId, refreshToken);
  }

  async me(userId: string): Promise<CurrentUserDto> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }
    return { id: user.id, email: user.email, role: user.role };
  }

  private async issueTokens(user: User): Promise<TokenPairDto> {
    const payload: JwtPayload = { sub: user.id, role: user.role };
    const accessToken = await this.jwtService.signAsync(payload);
    const refreshToken = await this.refreshTokensService.issue(user.id);
    return { accessToken, refreshToken };
  }

  private duplicateEmailConflict(): ConflictException {
    return new ConflictException('User with this email already exists');
  }
}
