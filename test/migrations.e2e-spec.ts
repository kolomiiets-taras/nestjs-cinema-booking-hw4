import { DataSource } from 'typeorm';
import {
  MIGRATIONS_TEST_DB,
  dropDatabase,
  migrationsDataSource,
  recreateDatabase,
} from './test-database';

const HW2_TABLES = ['booking_seats', 'bookings', 'films', 'halls', 'showings'];
const APP_TABLES = [...HW2_TABLES, 'refresh_tokens', 'users'];

describe('Migrations (e2e)', () => {
  let dataSource: DataSource;

  const tables = async (): Promise<string[]> => {
    const rows: { table_name: string }[] = await dataSource.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' ORDER BY table_name`,
    );
    return rows.map((row) => row.table_name);
  };

  const columnTypes = async (
    table: string,
  ): Promise<Record<string, string>> => {
    const rows: {
      column_name: string;
      data_type: string;
      is_nullable: string;
    }[] = await dataSource.query(
      `SELECT column_name, data_type, is_nullable FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1`,
      [table],
    );
    return Object.fromEntries(
      rows.map((row) => [
        row.column_name,
        `${row.data_type}${row.is_nullable === 'NO' ? ' not null' : ''}`,
      ]),
    );
  };

  const appliedMigrations = async (): Promise<string[]> => {
    const rows: { name: string }[] = await dataSource.query(
      'SELECT name FROM migrations ORDER BY id',
    );
    return rows.map((row) => row.name);
  };

  const revertAll = async (): Promise<void> => {
    for (;;) {
      const applied: unknown[] = await dataSource.query(
        'SELECT id FROM migrations',
      );
      if (applied.length === 0) {
        return;
      }
      await dataSource.undoLastMigration();
    }
  };

  beforeAll(async () => {
    await recreateDatabase(MIGRATIONS_TEST_DB);
    dataSource = migrationsDataSource(MIGRATIONS_TEST_DB);
    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
    await dropDatabase(MIGRATIONS_TEST_DB);
  });

  it('build the whole schema from an empty database', async () => {
    expect(await tables()).toEqual([]);
    await dataSource.runMigrations();
    expect(await tables()).toEqual([...APP_TABLES, 'migrations'].sort());
    expect(await appliedMigrations()).toEqual([
      'InitialSchema1793728152933',
      'CreateUsersAndRefreshTokens1793964918337',
      'AddUserIdToBookings1793964918338',
    ]);
  });

  it('create columns with the described types and constraints', async () => {
    expect(await columnTypes('showings')).toEqual({
      id: 'uuid not null',
      film_id: 'uuid not null',
      hall_id: 'uuid not null',
      starts_at: 'timestamp with time zone not null',
      price: 'integer not null',
    });
    expect(await columnTypes('bookings')).toEqual({
      id: 'uuid not null',
      showing_id: 'uuid not null',
      user_id: 'uuid not null',
      total_price: 'integer not null',
      created_at: 'timestamp with time zone not null',
    });
    expect(await columnTypes('users')).toEqual({
      id: 'uuid not null',
      email: 'character varying not null',
      password_hash: 'character varying not null',
      role: 'character varying not null',
      created_at: 'timestamp with time zone not null',
    });
    expect(await columnTypes('refresh_tokens')).toEqual({
      id: 'uuid not null',
      user_id: 'uuid not null',
      token_hash: 'character varying not null',
      expires_at: 'timestamp with time zone not null',
      created_at: 'timestamp with time zone not null',
    });
    expect(await columnTypes('booking_seats')).toEqual({
      id: 'uuid not null',
      booking_id: 'uuid not null',
      showing_id: 'uuid not null',
      row: 'integer not null',
      seat: 'integer not null',
    });

    const [index] = await dataSource.query<{ indexdef: string }[]>(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'UQ_booking_seats_showing_row_seat'`,
    );
    expect(index.indexdef).toContain(
      'UNIQUE INDEX "UQ_booking_seats_showing_row_seat" ON public.booking_seats USING btree (showing_id, "row", seat)',
    );

    const [film] = await dataSource.query<{ id: string }[]>(
      `INSERT INTO films (title, duration_minutes, release_year) VALUES ('X', 90, 2020) RETURNING id`,
    );
    expect(film.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('users: generated id, role "user" by default, unique email, only user/admin roles', async () => {
    const [user] = await dataSource.query<
      { id: string; role: string; created_at: Date }[]
    >(
      `INSERT INTO users (email, password_hash) VALUES ('a@example.com', 'h') RETURNING id, role, created_at`,
    );
    expect(user.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(user.role).toBe('user');
    expect(user.created_at).toBeInstanceOf(Date);

    await expect(
      dataSource.query(
        `INSERT INTO users (email, password_hash) VALUES ('a@example.com', 'h')`,
      ),
    ).rejects.toThrow(/unique/i);
    await expect(
      dataSource.query(
        `INSERT INTO users (email, password_hash, role) VALUES ('b@example.com', 'h', 'root')`,
      ),
    ).rejects.toThrow(/CHK_users_role/);
  });

  it('refresh_tokens: unique token_hash, deleting a user deletes the tokens', async () => {
    const [user] = await dataSource.query<{ id: string }[]>(
      `INSERT INTO users (email, password_hash) VALUES ('c@example.com', 'h') RETURNING id`,
    );
    const insertToken = (hash: string) =>
      dataSource.query(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '7 days')`,
        [user.id, hash],
      );
    await insertToken('h1');
    await insertToken('h2');
    await expect(insertToken('h1')).rejects.toThrow(/unique/i);

    await dataSource.query('DELETE FROM users WHERE id = $1', [user.id]);
    const [row] = await dataSource.query<{ count: string }[]>(
      'SELECT COUNT(*) AS count FROM refresh_tokens',
    );
    expect(Number(row.count)).toBe(0);
  });

  it('bookings.user_id: down() removes the column, up() deletes ownerless bookings first', async () => {
    await dataSource.undoLastMigration();
    expect(await columnTypes('bookings')).not.toHaveProperty('user_id');

    // A booking from before this homework, without an owner.
    const [film] = await dataSource.query<{ id: string }[]>(
      `SELECT id FROM films LIMIT 1`,
    );
    const [hall] = await dataSource.query<{ id: string }[]>(
      `INSERT INTO halls (name, rows, seats_per_row) VALUES ('H', 1, 1) RETURNING id`,
    );
    const [showing] = await dataSource.query<{ id: string }[]>(
      `INSERT INTO showings (film_id, hall_id, starts_at, price) VALUES ($1, $2, now(), 100) RETURNING id`,
      [film.id, hall.id],
    );
    await dataSource.query(
      `INSERT INTO bookings (showing_id, total_price) VALUES ($1, 100)`,
      [showing.id],
    );

    await dataSource.runMigrations();
    expect(await columnTypes('bookings')).toHaveProperty(
      'user_id',
      'uuid not null',
    );
    const [row] = await dataSource.query<{ count: string }[]>(
      'SELECT COUNT(*) AS count FROM bookings',
    );
    expect(Number(row.count)).toBe(0);
  });

  it('are reversible: down() returns the database to the empty state and up() works again', async () => {
    // One step back: the HW2 schema without users.
    await dataSource.undoLastMigration();
    await dataSource.undoLastMigration();
    expect(await tables()).toEqual([...HW2_TABLES, 'migrations'].sort());
    expect(await columnTypes('bookings')).not.toHaveProperty('user_id');

    await revertAll();
    expect(await tables()).toEqual(['migrations']);
    await dataSource.runMigrations();
    expect(await tables()).toEqual([...APP_TABLES, 'migrations'].sort());
  });
});
