import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Every booking belongs to a user: bookings.user_id NOT NULL -> users.id.
 * The database before this change is a development one, and existing bookings
 * have no owner, so they are deleted first (their seats go by ON DELETE CASCADE).
 */
export class AddUserIdToBookings1793964918338 implements MigrationInterface {
  name = 'AddUserIdToBookings1793964918338';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "bookings"`);
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD "user_id" uuid NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bookings_user_id" ON "bookings" ("user_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD CONSTRAINT "FK_64cd97487c5c42806458ab5520c" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // The deleted bookings cannot be restored; the schema returns to the previous state.
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP CONSTRAINT "FK_64cd97487c5c42806458ab5520c"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_bookings_user_id"`);
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN "user_id"`);
  }
}
