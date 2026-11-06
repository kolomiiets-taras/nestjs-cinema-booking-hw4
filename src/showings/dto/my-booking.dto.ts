import { ApiProperty } from '@nestjs/swagger';
import { BookingResponseDto } from './booking-response.dto';
import { ShowingResponseDto } from './showing-response.dto';

/** Item of GET /bookings/my: the booking together with its showing. */
export class MyBookingDto extends BookingResponseDto {
  @ApiProperty({
    type: ShowingResponseDto,
    description: 'Сеанс: фільм, зал, час початку, ціна',
  })
  showing: ShowingResponseDto;
}
