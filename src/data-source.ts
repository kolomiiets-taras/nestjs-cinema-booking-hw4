import 'dotenv/config';
import { DataSource } from 'typeorm';
import { RefreshToken } from './auth/entities/refresh-token.entity';
import { validate } from './config/environment-variables';
import { Film } from './films/entities/film.entity';
import { Hall } from './halls/entities/hall.entity';
import { BookingSeat } from './showings/entities/booking-seat.entity';
import { Booking } from './showings/entities/booking.entity';
import { Showing } from './showings/entities/showing.entity';
import { User } from './users/entities/user.entity';

/**
 * Data source for the TypeORM CLI (migrations) and the seed script.
 * The Nest application builds its own connection in AppModule via ConfigService.
 * The same validation as in the app is applied to the variables from .env.
 */
export const env = validate(process.env);

export default new DataSource({
  type: 'postgres',
  uuidExtension: 'pgcrypto',
  host: env.POSTGRES_HOST,
  port: env.POSTGRES_PORT,
  username: env.POSTGRES_USER,
  password: env.POSTGRES_PASSWORD,
  database: env.POSTGRES_DB,
  entities: [Film, Hall, Showing, Booking, BookingSeat, User, RefreshToken],
  migrations: [`${__dirname}/migrations/*.ts`],
});
