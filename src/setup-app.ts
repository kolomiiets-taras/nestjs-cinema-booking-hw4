import {
  ClassSerializerInterceptor,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

/** Shared app configuration: used by main.ts and by e2e tests. */
export function setupApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      // Unknown fields (e.g. `role` on registration, `userId` on booking) are dropped.
      whitelist: true,
      transform: true,
    }),
  );
  // Applies @Exclude() of entities (User.passwordHash) to every response.
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
  app.useGlobalFilters(new HttpExceptionFilter());

  const config = new DocumentBuilder()
    .setTitle('Cinema Booking API')
    .setDescription(
      'Фільми, зали, сеанси та бронювання місць (PostgreSQL + TypeORM). ' +
        'Користувачі, JWT access-токени, refresh-токени з ротацією та ролі user/admin.',
    )
    .setVersion('4.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
}
