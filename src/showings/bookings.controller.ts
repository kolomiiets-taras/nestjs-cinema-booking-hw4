import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { ADMIN_ONLY, ApiAuth } from '../common/decorators/api-auth.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { UserRole } from '../users/user-role.enum';
import { BookingsService } from './bookings.service';
import { BookingResponseDto } from './dto/booking-response.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { MyBookingDto } from './dto/my-booking.dto';

@ApiTags('bookings')
@Controller()
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Get('bookings')
  @Roles(UserRole.Admin)
  @ApiAuth(ADMIN_ONLY)
  @ApiOkResponse({
    type: [BookingResponseDto],
    description: 'Усі бронювання',
  })
  findAll(): Promise<BookingResponseDto[]> {
    return this.bookingsService.findAll();
  }

  @Get('bookings/my')
  @ApiAuth()
  @ApiOkResponse({
    type: [MyBookingDto],
    description: 'Бронювання поточного користувача з даними сеансу',
  })
  findMine(@CurrentUser('id') userId: string): Promise<MyBookingDto[]> {
    return this.bookingsService.findMine(userId);
  }

  @Post('showings/:id/bookings')
  @ApiAuth()
  @ApiCreatedResponse({
    type: BookingResponseDto,
    description:
      'Бронювання створено на користувача з токена (одна транзакція: бронювання + місця)',
  })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description:
      'Масив місць порожній, елемент без row/seat, місце повторюється або не існує в залі',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Сеанс не знайдено',
  })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'Хоча б одне місце вже зайняте — не бронюється жодне',
  })
  create(
    @Param('id', ParseUUIDPipe) showingId: string,
    @Body() dto: CreateBookingDto,
    @CurrentUser('id') userId: string,
  ): Promise<BookingResponseDto> {
    return this.bookingsService.create(showingId, dto, userId);
  }

  @Get('showings/:id/bookings')
  @Roles(UserRole.Admin)
  @ApiAuth(ADMIN_ONLY)
  @ApiOkResponse({
    type: [BookingResponseDto],
    description: 'Бронювання сеансу',
  })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'id не є UUID',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Сеанс не знайдено',
  })
  findByShowing(
    @Param('id', ParseUUIDPipe) showingId: string,
  ): Promise<BookingResponseDto[]> {
    return this.bookingsService.findByShowing(showingId);
  }

  @Delete('bookings/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAuth(
    'Бронювання належить іншому користувачу (адміністратор може скасувати будь-яке)',
  )
  @ApiNoContentResponse({
    description: 'Бронювання скасовано, місця звільнено',
  })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'id не є UUID',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Бронювання не знайдено',
  })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    return this.bookingsService.remove(id, user);
  }
}
