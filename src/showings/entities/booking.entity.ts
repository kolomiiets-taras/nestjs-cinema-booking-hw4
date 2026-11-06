import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { BookingSeat } from './booking-seat.entity';
import { Showing } from './showing.entity';

@Entity('bookings')
export class Booking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_bookings_showing_id')
  @Column({ name: 'showing_id', type: 'uuid' })
  showingId: string;

  // A booking does not exist without its showing.
  @ManyToOne(() => Showing, (showing) => showing.bookings, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'showing_id' })
  showing?: Showing;

  /** Owner of the booking: always the user from the access token. */
  @Index('IDX_bookings_user_id')
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, (user) => user.bookings, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  /** Showing price × number of seats, in kopecks. */
  @Column({ name: 'total_price', type: 'integer' })
  totalPrice: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @OneToMany(() => BookingSeat, (seat) => seat.booking)
  seats?: BookingSeat[];
}
