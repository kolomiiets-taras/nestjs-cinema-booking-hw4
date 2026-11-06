import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
import request, { Response } from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { TestUser, bearer, createTestApp, createUser } from './test-app';

const MISSING_ID = '00000000-0000-4000-8000-000000000000';

interface ErrorBody {
  statusCode: number;
  message: string | string[];
}
interface TokenPair {
  accessToken: string;
  refreshToken: string;
}
interface BookingBody {
  id: string;
  showingId: string;
  userId: string;
}
interface MyBookingBody extends BookingBody {
  showing: {
    id: string;
    film: { title: string };
    hall: { name: string };
    startsAt: string;
  };
}

const body = <T>(res: Response): T => res.body as T;
const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('hex');
const decodePayload = (jwt: string): Record<string, unknown> =>
  JSON.parse(
    Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'),
  ) as Record<string, unknown>;

describe('Auth, roles and ownership (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let http: () => ReturnType<typeof request>;
  /** Every response body of this suite: none may contain the password or its hash. */
  const bodies: string[] = [];

  let admin: TestUser;
  let olena: TestUser;
  let taras: TestUser;
  let showingId: string;

  const as = (user: TestUser) => ({ Authorization: bearer(user.accessToken) });
  const tokenRows = async (hash: string): Promise<number> => {
    const rows: unknown[] = await dataSource.query(
      'SELECT id FROM refresh_tokens WHERE token_hash = $1',
      [hash],
    );
    return rows.length;
  };

  beforeAll(async () => {
    ({ app, dataSource } = await createTestApp());
    http = () => request(app.getHttpServer());
    admin = await createUser(app, dataSource, 'admin@example.com', 'admin');
    olena = await createUser(app, dataSource, 'olena@example.com');
    taras = await createUser(app, dataSource, 'taras@example.com');

    const film = await http()
      .post('/films')
      .set(as(admin))
      .send({ title: 'Dune', durationMinutes: 166, releaseYear: 2024 })
      .expect(201);
    const hall = await http()
      .post('/halls')
      .set(as(admin))
      .send({ name: 'Red', rows: 3, seatsPerRow: 5 })
      .expect(201);
    const showing = await http()
      .post('/showings')
      .set(as(admin))
      .send({
        filmId: body<{ id: string }>(film).id,
        hallId: body<{ id: string }>(hall).id,
        startsAt: '2030-05-10T18:00:00Z',
        price: 12500,
      })
      .expect(201);
    showingId = body<{ id: string }>(showing).id;
  });

  afterEach(() => {
    for (const text of bodies) {
      expect(text).not.toMatch(/passwordHash|password_hash|\$2[aby]\$/);
      expect(text).not.toContain('password123');
    }
  });

  afterAll(async () => {
    await app.close();
  });

  const track = (res: Response): Response => {
    bodies.push(JSON.stringify(res.body));
    return res;
  };

  describe('POST /auth/register', () => {
    it('creates a user with role "user" and returns it without the password hash', async () => {
      const res = track(
        await http()
          .post('/auth/register')
          .send({
            email: '  New.User@Example.com ',
            password: 'secret123',
            role: 'admin',
          })
          .expect(201),
      );
      expect(res.body).toEqual({
        id: expect.any(String) as string,
        email: 'new.user@example.com',
        role: 'user',
        createdAt: expect.any(String) as string,
      });

      const [row] = await dataSource.query<
        { password_hash: string; role: string }[]
      >('SELECT password_hash, role FROM users WHERE email = $1', [
        'new.user@example.com',
      ]);
      expect(row.role).toBe('user');
      expect(row.password_hash).toMatch(/^\$2b\$\d{2}\$/);
      expect(row.password_hash).not.toContain('secret123');
    });

    it('400 on bad email or short password, 409 on an existing email', async () => {
      for (const dto of [
        { email: 'not-an-email', password: 'secret123' },
        { email: 'short@example.com', password: '1234567' },
        { password: 'secret123' },
        { email: 'nopass@example.com' },
      ]) {
        track(await http().post('/auth/register').send(dto).expect(400));
      }
      const duplicate = track(
        await http()
          .post('/auth/register')
          .send({ email: 'OLENA@example.com', password: 'another123' })
          .expect(409),
      );
      expect(body<ErrorBody>(duplicate).statusCode).toBe(409);
    });
  });

  describe('POST /auth/login', () => {
    it('returns an access JWT with sub and role, and a random refresh token stored as SHA-256', async () => {
      const res = track(
        await http()
          .post('/auth/login')
          .send({ email: olena.email, password: olena.password })
          .expect(200),
      );
      const { accessToken, refreshToken } = body<TokenPair>(res);
      expect(decodePayload(accessToken)).toMatchObject({
        sub: olena.id,
        role: 'user',
      });
      const payload = decodePayload(accessToken) as {
        iat: number;
        exp: number;
      };
      expect(payload.exp - payload.iat).toBe(15 * 60);

      expect(refreshToken.split('.')).toHaveLength(1);
      expect(await tokenRows(sha256(refreshToken))).toBe(1);
      expect(await tokenRows(refreshToken)).toBe(0);
    });

    it('401 with the same message for an unknown email and a wrong password', async () => {
      const unknown = track(
        await http()
          .post('/auth/login')
          .send({ email: 'nobody@example.com', password: olena.password })
          .expect(401),
      );
      const wrongPassword = track(
        await http()
          .post('/auth/login')
          .send({ email: olena.email, password: 'wrong-password' })
          .expect(401),
      );
      expect(body<ErrorBody>(unknown).message).toBe(
        body<ErrorBody>(wrongPassword).message,
      );
    });
  });

  describe('AuthGuard', () => {
    it('GET /auth/me returns id, email and role of the token owner', async () => {
      const res = track(
        await http().get('/auth/me').set(as(olena)).expect(200),
      );
      expect(res.body).toEqual({
        id: olena.id,
        email: olena.email,
        role: 'user',
      });
    });

    it('401 for a missing header, malformed header, bad signature, expired or forged token', async () => {
      const jwt = app.get(JwtService);
      const foreignKey = new JwtService({ secret: 'x'.repeat(40) });
      const headers = [
        undefined,
        olena.accessToken,
        `Token ${olena.accessToken}`,
        'Bearer',
        'Bearer ',
        `Bearer ${olena.accessToken} extra`,
        'Bearer not-a-jwt',
        bearer(`${olena.accessToken.slice(0, -2)}xx`),
        bearer(foreignKey.sign({ sub: admin.id, role: 'admin' })),
        bearer(jwt.sign({ sub: olena.id, role: 'user' }, { expiresIn: -10 })),
        bearer(jwt.sign({ sub: olena.id, role: 'root' })),
      ];
      for (const header of headers) {
        const req = http().get('/auth/me');
        const res = track(
          await (header === undefined ? req : req.set('Authorization', header)),
        );
        expect({ header, status: res.status }).toEqual({ header, status: 401 });
      }
    });

    it('public routes work without a token', async () => {
      await http().get('/films').expect(200);
      await http().get('/halls').expect(200);
      await http().get('/showings').expect(200);
      await http().get(`/showings/${showingId}`).expect(200);
      await http().get(`/showings/${showingId}/seats`).expect(200);
    });
  });

  describe('RolesGuard', () => {
    const adminRoutes = (): [string, string][] => [
      ['post', '/films'],
      ['patch', `/films/${MISSING_ID}`],
      ['delete', `/films/${MISSING_ID}`],
      ['post', '/halls'],
      ['delete', `/halls/${MISSING_ID}`],
      ['get', '/bookings'],
      ['post', '/showings'],
      ['get', `/showings/${showingId}/bookings`],
    ];

    it('admin routes: 401 without a token, 403 for role user, allowed for admin', async () => {
      for (const [method, url] of adminRoutes()) {
        const call = () =>
          (http() as unknown as Record<string, (u: string) => request.Test>)[
            method
          ](url);
        const anonymous = await call();
        const user = track(await call().set(as(olena)));
        const byAdmin = await call().set(as(admin));
        expect({
          method,
          url,
          statuses: [anonymous.status, user.status],
        }).toEqual({ method, url, statuses: [401, 403] });
        expect([401, 403]).not.toContain(byAdmin.status);
      }
    });

    it('routes for any authenticated user: 401 without a token', async () => {
      await http()
        .post(`/showings/${showingId}/bookings`)
        .send({ seats: [{ row: 1, seat: 1 }] })
        .expect(401);
      await http().delete(`/bookings/${MISSING_ID}`).expect(401);
      await http().get('/bookings/my').expect(401);
      await http().get('/auth/me').expect(401);
      await http()
        .post('/auth/logout')
        .send({ refreshToken: olena.refreshToken })
        .expect(401);
    });

    it('a new role reaches the token on refresh', async () => {
      const user = await createUser(app, dataSource, 'promoted@example.com');
      await http().post('/films').set(as(user)).send({}).expect(403);
      await dataSource.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [
        user.id,
      ]);
      const res = await http()
        .post('/auth/refresh')
        .send({ refreshToken: user.refreshToken })
        .expect(200);
      const { accessToken } = body<TokenPair>(res);
      expect(decodePayload(accessToken).role).toBe('admin');
      await http()
        .post('/films')
        .set('Authorization', bearer(accessToken))
        .send({})
        .expect(400);
    });
  });

  describe('bookings and ownership', () => {
    let olenaBooking: string;
    let tarasBooking: string;

    it('a booking is created for the user from the token; userId in the body is ignored', async () => {
      const res = track(
        await http()
          .post(`/showings/${showingId}/bookings`)
          .set(as(olena))
          .send({ userId: taras.id, seats: [{ row: 1, seat: 1 }] })
          .expect(201),
      );
      expect(body<BookingBody>(res).userId).toBe(olena.id);
      olenaBooking = body<BookingBody>(res).id;

      const other = await http()
        .post(`/showings/${showingId}/bookings`)
        .set(as(taras))
        .send({ seats: [{ row: 2, seat: 2 }] })
        .expect(201);
      tarasBooking = body<BookingBody>(other).id;
    });

    it('GET /bookings/my returns only own bookings with showing data', async () => {
      const res = track(
        await http().get('/bookings/my').set(as(olena)).expect(200),
      );
      const mine = body<MyBookingBody[]>(res);
      expect(mine.map((b) => b.id)).toEqual([olenaBooking]);
      expect(mine[0].showing).toMatchObject({
        id: showingId,
        film: { title: 'Dune' },
        hall: { name: 'Red' },
        startsAt: '2030-05-10T18:00:00.000Z',
      });
      const empty = await http().get('/bookings/my').set(as(admin)).expect(200);
      expect(empty.body).toEqual([]);
    });

    it('DELETE /bookings/:id: 403 for a foreign booking, 404 for a missing one, admin cancels any', async () => {
      const foreign = track(
        await http()
          .delete(`/bookings/${tarasBooking}`)
          .set(as(olena))
          .expect(403),
      );
      expect(body<ErrorBody>(foreign).statusCode).toBe(403);
      await http().delete(`/bookings/${MISSING_ID}`).set(as(olena)).expect(404);
      // Still there after the forbidden attempt.
      const tarasMine = await http().get('/bookings/my').set(as(taras));
      expect(body<BookingBody[]>(tarasMine).map((b) => b.id)).toEqual([
        tarasBooking,
      ]);

      await http()
        .delete(`/bookings/${olenaBooking}`)
        .set(as(olena))
        .expect(204);
      await http()
        .delete(`/bookings/${tarasBooking}`)
        .set(as(admin))
        .expect(204);
      await http()
        .delete(`/bookings/${tarasBooking}`)
        .set(as(admin))
        .expect(404);
    });
  });

  describe('POST /auth/refresh', () => {
    it('rotates: a new pair is issued, the used token is deleted and gives 401', async () => {
      const user = await createUser(app, dataSource, 'rotate@example.com');
      const first = track(
        await http()
          .post('/auth/refresh')
          .send({ refreshToken: user.refreshToken })
          .expect(200),
      );
      const pair = body<TokenPair>(first);
      expect(pair.refreshToken).not.toBe(user.refreshToken);
      expect(await tokenRows(sha256(user.refreshToken))).toBe(0);
      expect(await tokenRows(sha256(pair.refreshToken))).toBe(1);
      await http()
        .get('/auth/me')
        .set('Authorization', bearer(pair.accessToken))
        .expect(200);

      await http()
        .post('/auth/refresh')
        .send({ refreshToken: user.refreshToken })
        .expect(401);
      await http()
        .post('/auth/refresh')
        .send({ refreshToken: pair.refreshToken })
        .expect(200);
    });

    it('only one of parallel requests with the same token succeeds', async () => {
      const user = await createUser(app, dataSource, 'parallel@example.com');
      const results = await Promise.all(
        Array.from({ length: 6 }, () =>
          http()
            .post('/auth/refresh')
            .send({ refreshToken: user.refreshToken }),
        ),
      );
      expect(results.map((res) => res.status).sort()).toEqual([
        200, 401, 401, 401, 401, 401,
      ]);
    });

    it('401 for an expired, unknown or missing token', async () => {
      const user = await createUser(app, dataSource, 'expired@example.com');
      await dataSource.query(
        `UPDATE refresh_tokens SET expires_at = now() - interval '1 second' WHERE token_hash = $1`,
        [sha256(user.refreshToken)],
      );
      await http()
        .post('/auth/refresh')
        .send({ refreshToken: user.refreshToken })
        .expect(401);
      await http()
        .post('/auth/refresh')
        .send({ refreshToken: 'unknown-token' })
        .expect(401);
      await http().post('/auth/refresh').send({}).expect(400);
    });
  });

  describe('POST /auth/logout', () => {
    it('revokes only own refresh token: 404 for a foreign or unknown token, 204 for own', async () => {
      const user = await createUser(app, dataSource, 'logout@example.com');
      const other = await createUser(app, dataSource, 'other@example.com');

      await http()
        .post('/auth/logout')
        .set(as(user))
        .send({ refreshToken: other.refreshToken })
        .expect(404);
      expect(await tokenRows(sha256(other.refreshToken))).toBe(1);
      await http()
        .post('/auth/logout')
        .set(as(user))
        .send({ refreshToken: 'unknown-token' })
        .expect(404);

      const res = await http()
        .post('/auth/logout')
        .set(as(user))
        .send({ refreshToken: user.refreshToken })
        .expect(204);
      expect(res.text).toBe('');
      expect(await tokenRows(sha256(user.refreshToken))).toBe(0);

      await http()
        .post('/auth/refresh')
        .send({ refreshToken: user.refreshToken })
        .expect(401);
      await http()
        .post('/auth/logout')
        .set(as(user))
        .send({ refreshToken: user.refreshToken })
        .expect(404);
      // The other user's session is untouched.
      await http()
        .post('/auth/refresh')
        .send({ refreshToken: other.refreshToken })
        .expect(200);
    });
  });

  describe('swagger', () => {
    it('describes the Bearer scheme, 401 on protected routes and 403 where access can be forbidden', async () => {
      const res = await http().get('/docs-json').expect(200);
      type Operation = {
        security?: Record<string, string[]>[];
        responses: Record<string, unknown>;
      };
      const doc = body<{
        paths: Record<string, Record<string, Operation>>;
        components: {
          securitySchemes: Record<string, { type: string; scheme: string }>;
          schemas: Record<string, { properties?: Record<string, unknown> }>;
        };
      }>(res);
      expect(doc.components.securitySchemes.bearer).toMatchObject({
        type: 'http',
        scheme: 'bearer',
      });
      expect(doc.components.schemas.User.properties).not.toHaveProperty(
        'passwordHash',
      );

      const op = (path: string, method: string) => doc.paths[path][method];
      const forbiddable = [
        op('/films', 'post'),
        op('/films/{id}', 'patch'),
        op('/films/{id}', 'delete'),
        op('/halls', 'post'),
        op('/halls/{id}', 'delete'),
        op('/bookings', 'get'),
        op('/showings', 'post'),
        op('/showings/{id}/bookings', 'get'),
        op('/bookings/{id}', 'delete'),
      ];
      const authenticated = [
        op('/showings/{id}/bookings', 'post'),
        op('/bookings/my', 'get'),
        op('/auth/logout', 'post'),
        op('/auth/me', 'get'),
      ];
      for (const operation of [...forbiddable, ...authenticated]) {
        expect(operation.security).toEqual([{ bearer: [] }]);
        expect(operation.responses).toHaveProperty('401');
      }
      for (const operation of forbiddable) {
        expect(operation.responses).toHaveProperty('403');
      }
      for (const operation of [
        op('/films', 'get'),
        op('/showings/{id}/seats', 'get'),
        op('/auth/login', 'post'),
      ]) {
        expect(operation.security).toBeUndefined();
      }
    });
  });
});
