import { MigrationInterface, QueryRunner } from 'typeorm';

// Phase 15: staff roles (replaces the single "role" column, keeping existing admins),
// revocable sessions, plan versions, free trials, tournament ownership, audit trail.
// Generated from the entities, then edited by hand so no data is lost:
//   - "role" = 'ADMIN'  →  "roles" = 'ADMIN' (copied before "role" is dropped)
//   - existing paid members are pinned to plan version 1 (grandfathering)

export class RolesPlansTrialsAudit1790151660567 implements MigrationInterface {
  name = 'RolesPlansTrialsAudit1790151660567';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "audit_log" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "actorType" character varying NOT NULL DEFAULT 'USER', "actorUserId" integer, "action" character varying NOT NULL, "targetType" text, "targetId" text, "details" text, "ip" text, "requestId" text, CONSTRAINT "PK_07fefa57f7f5ab8fc3f52b3ed0b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_78e013ffae12f5a1fc1dbefff9" ON "audit_log" ("createdAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b2a2e69f0abb8e3c1293fea255" ON "audit_log" ("actorUserId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7c0cca6e6369db3a240aa4cf13" ON "audit_log" ("targetType", "targetId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_877c99611f347708de5db67fd0" ON "audit_log" ("action", "createdAt") `,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "roles" text NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `UPDATE "user" SET "roles" = 'ADMIN' WHERE "role" = 'ADMIN'`,
    );
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "role"`);
    await queryRunner.query(
      `ALTER TABLE "user" ADD "tokenVersion" integer NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "createdAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(`ALTER TABLE "user" ADD "planVersion" integer`);
    await queryRunner.query(`ALTER TABLE "user" ADD "billingInterval" text`);
    await queryRunner.query(`ALTER TABLE "user" ADD "stripePriceId" text`);
    await queryRunner.query(`ALTER TABLE "user" ADD "trialPlan" text`);
    await queryRunner.query(
      `ALTER TABLE "user" ADD "trialPlanVersion" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "trialStartedAt" TIMESTAMP`,
    );
    await queryRunner.query(`ALTER TABLE "user" ADD "trialEndsAt" TIMESTAMP`);
    await queryRunner.query(
      `ALTER TABLE "user" ADD "trialEndingNotifiedAt" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "trialEndedNotifiedAt" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament" ADD "createdByUserId" integer`,
    );
    await queryRunner.query(
      `UPDATE "user" SET "planVersion" = 1 WHERE "membershipTier" <> 'FREE'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tournament" DROP COLUMN "createdByUserId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "trialEndedNotifiedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "trialEndingNotifiedAt"`,
    );
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "trialEndsAt"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "trialStartedAt"`);
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "trialPlanVersion"`,
    );
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "trialPlan"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "stripePriceId"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "billingInterval"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "planVersion"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "createdAt"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "tokenVersion"`);
    await queryRunner.query(
      `ALTER TABLE "user" ADD "role" character varying NOT NULL DEFAULT 'USER'`,
    );
    await queryRunner.query(
      `UPDATE "user" SET "role" = 'ADMIN' WHERE (',' || "roles" || ',') LIKE '%,ADMIN,%'`,
    );
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "roles"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_877c99611f347708de5db67fd0"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7c0cca6e6369db3a240aa4cf13"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_b2a2e69f0abb8e3c1293fea255"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_78e013ffae12f5a1fc1dbefff9"`,
    );
    await queryRunner.query(`DROP TABLE "audit_log"`);
  }
}
