import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  PG_UNIQUE_VIOLATION,
  isDatabaseError,
} from '../common/database-errors';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { Seat } from '../halls/dto/hall-with-seats.dto';
import { HallsService } from '../halls/halls.service';
import { UserRole } from '../users/user-role.enum';
import { BookingResponseDto } from './dto/booking-response.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { MyBookingDto } from './dto/my-booking.dto';
import { SeatStateDto } from './dto/seat-state.dto';
import { BookingSeat } from './entities/booking-seat.entity';
import { Booking } from './entities/booking.entity';
import { ShowingsService } from './showings.service';

const seatKey = ({ row, seat }: Seat): string => `${row}:${seat}`;

@Injectable()
export class BookingsService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(Booking)
    private readonly bookingsRepository: Repository<Booking>,
    @InjectRepository(BookingSeat)
    private readonly bookingSeatsRepository: Repository<BookingSeat>,
    private readonly showingsService: ShowingsService,
    @Inject(forwardRef(() => HallsService))
    private readonly hallsService: HallsService,
  ) {}

  /** The owner is always the user from the access token, never from the body. */
  async create(
    showingId: string,
    dto: CreateBookingDto,
    userId: string,
  ): Promise<BookingResponseDto> {
    const showing = await this.showingsService.findOne(showingId);
    const hall = await this.hallsService.findOne(showing.hallId);

    const outside = dto.seats.filter(
      (seat) => !this.hallsService.hasSeat(hall, seat),
    );
    if (outside.length > 0) {
      throw new BadRequestException(
        `Seats do not exist in hall "${hall.name}" (${hall.rows} rows × ${hall.seatsPerRow} seats): ` +
          outside.map(seatKey).join(', '),
      );
    }

    try {
      // The booking row and all its seat rows are written in one transaction:
      // if any insert fails, nothing of this booking stays in the database.
      const booking = await this.dataSource.transaction(async (manager) => {
        // Fast path with a readable message. It is not the guarantee: two concurrent
        // requests may both pass it, and then the unique index decides (see catch below).
        const taken = await manager.find(BookingSeat, {
          select: { row: true, seat: true },
          where: dto.seats.map(({ row, seat }) => ({ showingId, row, seat })),
        });
        if (taken.length > 0) {
          throw new ConflictException(
            `Seats are already booked: ${taken.map(seatKey).join(', ')}`,
          );
        }

        const created = await manager.save(
          manager.create(Booking, {
            showingId,
            userId,
            totalPrice: showing.price * dto.seats.length,
          }),
        );
        created.seats = await manager.save(
          dto.seats.map(({ row, seat }) =>
            manager.create(BookingSeat, {
              bookingId: created.id,
              showingId,
              row,
              seat,
            }),
          ),
        );
        return created;
      });
      return this.toResponse(booking);
    } catch (error) {
      if (isDatabaseError(error, PG_UNIQUE_VIOLATION)) {
        // The transaction is already rolled back; the database error text is not exposed.
        throw new ConflictException('One or more seats are already booked');
      }
      throw error;
    }
  }

  async findAll(): Promise<BookingResponseDto[]> {
    const bookings = await this.bookingsRepository.find({
      relations: { seats: true },
      order: {
        createdAt: 'ASC',
        id: 'ASC',
        seats: { row: 'ASC', seat: 'ASC' },
      },
    });
    return bookings.map((booking) => this.toResponse(booking));
  }

  async findByShowing(showingId: string): Promise<BookingResponseDto[]> {
    await this.showingsService.findOne(showingId);
    const bookings = await this.bookingsRepository.find({
      where: { showingId },
      relations: { seats: true },
      order: {
        createdAt: 'ASC',
        id: 'ASC',
        seats: { row: 'ASC', seat: 'ASC' },
      },
    });
    return bookings.map((booking) => this.toResponse(booking));
  }

  /** Bookings of one user with their showings (film title, hall name, start time). */
  async findMine(userId: string): Promise<MyBookingDto[]> {
    const bookings = await this.bookingsRepository.find({
      where: { userId },
      relations: { seats: true, showing: { film: true, hall: true } },
      order: {
        createdAt: 'ASC',
        id: 'ASC',
        seats: { row: 'ASC', seat: 'ASC' },
      },
    });
    return bookings.map((booking) => {
      if (!booking.showing) {
        throw new Error(`Booking "${booking.id}" was loaded without showing`);
      }
      return {
        ...this.toResponse(booking),
        showing: this.showingsService.toResponse(booking.showing),
      };
    });
  }

  async getSeatMap(showingId: string): Promise<SeatStateDto[]> {
    const showing = await this.showingsService.findOne(showingId);
    const hall = await this.hallsService.findOne(showing.hallId);
    const bookedSeats = await this.bookingSeatsRepository.find({
      select: { row: true, seat: true },
      where: { showingId },
    });
    const booked = new Set(bookedSeats.map(seatKey));
    return this.hallsService
      .getSeats(hall)
      .map((seat) => ({ ...seat, isBooked: booked.has(seatKey(seat)) }));
  }

  /**
   * A user cancels only their own booking, an administrator — any booking.
   * The owner check needs the booking itself, so it is done here, not in a guard.
   * Seats of the booking are removed by ON DELETE CASCADE on booking_seats.booking_id.
   */
  async remove(id: string, user: AuthUser): Promise<void> {
    const booking = await this.bookingsRepository.findOne({
      select: { id: true, userId: true },
      where: { id },
    });
    if (!booking) {
      throw this.bookingNotFound(id);
    }
    if (user.role !== UserRole.Admin && booking.userId !== user.id) {
      throw new ForbiddenException(`Booking "${id}" belongs to another user`);
    }
    const result = await this.bookingsRepository.delete({ id });
    if (!result.affected) {
      // Cancelled by a parallel request between the check and the delete.
      throw this.bookingNotFound(id);
    }
  }

  private bookingNotFound(id: string): NotFoundException {
    return new NotFoundException(`Booking with id "${id}" not found`);
  }

  private toResponse(booking: Booking): BookingResponseDto {
    return {
      id: booking.id,
      showingId: booking.showingId,
      userId: booking.userId,
      seats: (booking.seats ?? []).map(({ row, seat }) => ({ row, seat })),
      totalPrice: booking.totalPrice,
      createdAt: booking.createdAt.toISOString(),
    };
  }
}
