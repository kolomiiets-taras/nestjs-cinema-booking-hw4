import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';

export interface TestUser {
  id: string;
  email: string;
  password: string;
  accessToken: string;
  refreshToken: string;
}

/** The application exactly as main.ts builds it, on an emptied test database. */
export async function createTestApp(): Promise<{
  app: INestApplication<App>;
  dataSource: DataSource;
}> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  setupApp(app);
  await app.init();
  const dataSource = app.get(DataSource);
  await dataSource.query(
    'TRUNCATE booking_seats, bookings, showings, halls, films, refresh_tokens, users',
  );
  return { app, dataSource };
}

export const bearer = (token: string): string => `Bearer ${token}`;

/**
 * Registers a user through the API and logs in. An admin is made the same way
 * as described in README: the role is changed in the database, then login.
 */
export async function createUser(
  app: INestApplication<App>,
  dataSource: DataSource,
  email: string,
  role: 'user' | 'admin' = 'user',
): Promise<TestUser> {
  const password = 'password123';
  const server = app.getHttpServer();
  const registered = await request(server)
    .post('/auth/register')
    .send({ email, password })
    .expect(201);
  const { id } = registered.body as { id: string };
  if (role === 'admin') {
    await dataSource.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [
      id,
    ]);
  }
  const login = await request(server)
    .post('/auth/login')
    .send({ email, password })
    .expect(200);
  const tokens = login.body as { accessToken: string; refreshToken: string };
  return { id, email, password, ...tokens };
}
