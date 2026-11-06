import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { RefreshToken } from '../../auth/entities/refresh-token.entity';
import { Booking } from '../../showings/entities/booking.entity';
import { UserRole } from '../user-role.enum';

/**
 * Services return instances of this class: ClassSerializerInterceptor
 * applies @Exclude() only to class instances, not to plain objects.
 */
@Entity('users')
@Check('CHK_users_role', `"role" IN ('user', 'admin')`)
export class User {
  @ApiProperty({
    format: 'uuid',
    example: '5d0c6a43-2b7e-4f1a-9c3d-8e2f1a0b7c64',
  })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stored trimmed and in lower case. */
  @ApiProperty({ example: 'olena@example.com' })
  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  /** bcrypt hash; never leaves the server. */
  @Exclude()
  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash: string;

  @ApiProperty({ enum: UserRole, example: UserRole.User })
  @Column({ type: 'varchar', length: 20, default: UserRole.User })
  role: UserRole;

  @ApiProperty({ example: '2026-11-25T18:00:00.000Z' })
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @OneToMany(() => RefreshToken, (token) => token.user)
  refreshTokens?: RefreshToken[];

  @OneToMany(() => Booking, (booking) => booking.user)
  bookings?: Booking[];
}
