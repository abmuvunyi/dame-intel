import { MigrationInterface, QueryRunner } from 'typeorm';

// Free plan's one game review per 24h: which game it was spent on, and when.
export class DailyFreeReview1791400000000 implements MigrationInterface {
  name = 'DailyFreeReview1791400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" ADD "lastFreeReviewAt" TIMESTAMP`);
    await queryRunner.query(`ALTER TABLE "user" ADD "lastFreeReviewGameId" integer`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "lastFreeReviewGameId"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "lastFreeReviewAt"`);
  }
}
