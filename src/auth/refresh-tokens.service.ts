import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { LessThanOrEqual, Repository } from 'typeorm';
import {
  EnvironmentVariables,
  daysToMs,
} from '../config/environment-variables';
import { RefreshToken } from './entities/refresh-token.entity';

@Injectable()
export class RefreshTokensService {
  private readonly ttlMs: number;

  constructor(
    @InjectRepository(RefreshToken)
    private readonly refreshTokensRepository: Repository<RefreshToken>,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.ttlMs = daysToMs(config.get('JWT_REFRESH_TTL', { infer: true }));
  }

  /** Creates a random token for the user; only its hash goes to the database. */
  async issue(userId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    // Housekeeping: expired tokens of this user can never be used again.
    await this.refreshTokensRepository.delete({
      userId,
      expiresAt: LessThanOrEqual(new Date()),
    });
    await this.refreshTokensRepository.insert({
      userId,
      tokenHash: this.hash(token),
      expiresAt: new Date(Date.now() + this.ttlMs),
    });
    return token;
  }

  /**
   * Rotation: finds and deletes the token in ONE statement
   * (DELETE ... WHERE token_hash = $1 AND expires_at > now() RETURNING user_id).
   * Of two parallel requests with the same token only one gets the row;
   * an empty result means the token is unknown, expired or already used.
   */
  async consume(token: string): Promise<string> {
    const result = await this.refreshTokensRepository
      .createQueryBuilder()
      .delete()
      .where('token_hash = :tokenHash', { tokenHash: this.hash(token) })
      .andWhere('expires_at > now()')
      .returning('user_id')
      .execute();
    const [deleted] = result.raw as { user_id: string }[];
    if (!deleted) {
      throw new UnauthorizedException(
        'Refresh token is invalid, expired or already used',
      );
    }
    return deleted.user_id;
  }

  /** Logout: deletes the token only when it belongs to the current user. */
  async revoke(userId: string, token: string): Promise<void> {
    const result = await this.refreshTokensRepository.delete({
      userId,
      tokenHash: this.hash(token),
    });
    if (!result.affected) {
      throw new NotFoundException(
        'Refresh token not found for the current user',
      );
    }
  }

  /** SHA-256 is deterministic, so the stored hash can be found by the token. */
  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
