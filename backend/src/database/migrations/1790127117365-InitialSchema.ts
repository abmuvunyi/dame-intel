import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1790127117365 implements MigrationInterface {
  name = 'InitialSchema1790127117365';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "user" ("id" SERIAL NOT NULL, "username" character varying NOT NULL, "passwordHash" character varying NOT NULL, "rating" integer NOT NULL DEFAULT '1200', "role" character varying NOT NULL DEFAULT 'USER', "gamesPlayed" integer NOT NULL DEFAULT '0', "wins" integer NOT NULL DEFAULT '0', "losses" integer NOT NULL DEFAULT '0', "draws" integer NOT NULL DEFAULT '0', "moderationStatus" character varying NOT NULL DEFAULT 'NONE', "tempBanUntil" TIMESTAMP, "moderationNote" text, "membershipTier" character varying NOT NULL DEFAULT 'FREE', "membershipStatus" character varying NOT NULL DEFAULT 'NONE', "stripeCustomerId" text, "stripeSubscriptionId" text, "membershipRenewsAt" TIMESTAMP, "email" text, "currentStreak" integer NOT NULL DEFAULT '0', "lastPlayedDate" text, CONSTRAINT "UQ_78a916df40e02a9deb1c4b75edb" UNIQUE ("username"), CONSTRAINT "UQ_0bfe583759eb0305b60117be840" UNIQUE ("stripeCustomerId"), CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "tournament_player" ("id" SERIAL NOT NULL, "score" double precision NOT NULL DEFAULT '0', "tournamentId" integer, "userId" integer, CONSTRAINT "PK_3b7e4840a7d8de4917b6cd665dd" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "tournament" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "format" character varying NOT NULL, "status" character varying NOT NULL DEFAULT 'UPCOMING', "totalRounds" integer, "currentRound" integer NOT NULL DEFAULT '0', "maxParticipants" integer, "timeControlName" character varying NOT NULL DEFAULT 'blitz', "boardSize" integer NOT NULL DEFAULT '10', "ruleVariant" character varying NOT NULL DEFAULT 'international', "pointsWin" double precision NOT NULL DEFAULT '1', "pointsDraw" double precision NOT NULL DEFAULT '0.5', "pointsLoss" double precision NOT NULL DEFAULT '0', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_449f912ba2b62be003f0c22e767" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "swiss_round" ("id" SERIAL NOT NULL, "tournamentId" integer NOT NULL, "roundNumber" integer NOT NULL, "status" character varying NOT NULL DEFAULT 'IN_PROGRESS', "startedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_f987f6fb7e7e8f58bc9a3f1ebbc" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "swiss_pairing_record" ("id" SERIAL NOT NULL, "roundId" integer NOT NULL, "player1Id" integer NOT NULL, "player2Id" integer, "result" character varying, "gameHistoryId" integer, CONSTRAINT "PK_b489a29f2442b9079404e95deb0" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "rating_history_entry" ("id" SERIAL NOT NULL, "userId" integer NOT NULL, "variant" character varying NOT NULL, "timeControl" character varying NOT NULL, "rating" double precision NOT NULL, "ratingDeviation" double precision NOT NULL, "volatility" double precision NOT NULL, "opponentUserId" integer, "result" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_5d0da2f74ef78f64671c0ffd74d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_68bbd44d5639ac0b2ba83770de" ON "rating_history_entry" ("userId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "player_rating" ("id" SERIAL NOT NULL, "userId" integer NOT NULL, "variant" character varying NOT NULL, "timeControl" character varying NOT NULL, "rating" double precision NOT NULL DEFAULT '1500', "ratingDeviation" double precision NOT NULL DEFAULT '350', "volatility" double precision NOT NULL DEFAULT '0.06', "gamesPlayed" integer NOT NULL DEFAULT '0', "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_9fdb48dcf357fb65b42ccf854ba" UNIQUE ("userId", "variant", "timeControl"), CONSTRAINT "PK_de64778b3d28c48e638779f28d9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "puzzle" ("id" SERIAL NOT NULL, "difficulty" integer NOT NULL, "boardSize" integer NOT NULL DEFAULT '8', "board" text NOT NULL, "turnToMove" character varying NOT NULL, "solution" text NOT NULL, "status" character varying NOT NULL DEFAULT 'published', "sourceGameId" integer, "gamePhase" text, "rating" double precision NOT NULL DEFAULT '1500', "ratingDeviation" double precision NOT NULL DEFAULT '350', "volatility" double precision NOT NULL DEFAULT '0.06', "timesAttempted" integer NOT NULL DEFAULT '0', "timesSolved" integer NOT NULL DEFAULT '0', "isPremium" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_7c0a3dfb399417fd58ac1fdde6a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "puzzle_rush_session" ("id" SERIAL NOT NULL, "userId" integer, "startedAt" TIMESTAMP NOT NULL DEFAULT now(), "durationSeconds" integer NOT NULL, "currentPuzzleId" integer, "score" integer NOT NULL DEFAULT '0', "streak" integer NOT NULL DEFAULT '0', "bestStreak" integer NOT NULL DEFAULT '0', "solved" integer NOT NULL DEFAULT '0', "failed" integer NOT NULL DEFAULT '0', "ended" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_bac5aa34045c5c0b65c3927f3c3" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "player_puzzle_rating" ("id" SERIAL NOT NULL, "userId" integer NOT NULL, "rating" double precision NOT NULL DEFAULT '1500', "ratingDeviation" double precision NOT NULL DEFAULT '350', "volatility" double precision NOT NULL DEFAULT '0.06', "puzzlesAttempted" integer NOT NULL DEFAULT '0', CONSTRAINT "UQ_55f31093d09b9adc165f3983587" UNIQUE ("userId"), CONSTRAINT "PK_ec7229ddc40c8ef080ea741018a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "notification" ("id" SERIAL NOT NULL, "userId" integer NOT NULL, "type" character varying NOT NULL, "message" character varying NOT NULL, "data" text, "read" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_705b6c7cdf9b2c2ff7ac7872cb7" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_1ced25315eb974b73391fb1c81" ON "notification" ("userId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "lesson" ("id" SERIAL NOT NULL, "slug" character varying NOT NULL, "title" character varying NOT NULL, "category" text NOT NULL, "difficulty" integer NOT NULL DEFAULT '1', "summary" text NOT NULL, "body" text NOT NULL, "exampleBoard" text, "exampleBoardSize" integer NOT NULL DEFAULT '8', "orderIndex" integer NOT NULL DEFAULT '0', CONSTRAINT "UQ_db1819e1834a90ab442530d7c2c" UNIQUE ("slug"), CONSTRAINT "PK_0ef25918f0237e68696dee455bd" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "game_history" ("id" SERIAL NOT NULL, "winner" character varying, "moves" text NOT NULL, "rules" text, "moveTimings" text, "playedAt" TIMESTAMP NOT NULL DEFAULT now(), "lightPlayerId" integer, "darkPlayerId" integer, CONSTRAINT "PK_0e74b90c56b815ed54e90a29f1a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "friendship" ("id" SERIAL NOT NULL, "status" character varying NOT NULL DEFAULT 'PENDING', "user1Id" integer, "user2Id" integer, CONSTRAINT "PK_dbd6fb568cd912c5140307075cc" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "club" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "description" character varying NOT NULL DEFAULT '', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "createdById" integer, CONSTRAINT "PK_79282481e036a6e0b180afa38aa" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "club_post" ("id" SERIAL NOT NULL, "clubId" integer NOT NULL, "content" text NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "authorId" integer, CONSTRAINT "PK_78caee83d6637528b6156e49d95" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "club_membership" ("id" SERIAL NOT NULL, "clubId" integer NOT NULL, "userId" integer NOT NULL, "joinedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_a13e548aa6181055c797bcc2a38" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "cheat_flag" ("id" SERIAL NOT NULL, "flagType" character varying NOT NULL, "score" double precision NOT NULL, "reason" character varying NOT NULL, "gameId" integer, "sampleSize" integer, "reviewed" boolean NOT NULL DEFAULT false, "reviewedByUserId" integer, "moderatorNote" text, "moderatorAction" text, "reviewedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" integer, CONSTRAINT "PK_5ec88423d31a50a320a6d61eea9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "game_review" ("id" SERIAL NOT NULL, "gameId" integer NOT NULL, "status" character varying NOT NULL DEFAULT 'PENDING', "moveReviews" text, "lightAccuracy" double precision, "darkAccuracy" double precision, "errorMessage" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "completedAt" TIMESTAMP, CONSTRAINT "UQ_4b7cf6a13d7c1fc3e5f8ccf5f2c" UNIQUE ("gameId"), CONSTRAINT "PK_5384f716429a1f37d6615599ee0" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_player" ADD CONSTRAINT "FK_e6d2fd1531abe3de6fd8212d882" FOREIGN KEY ("tournamentId") REFERENCES "tournament"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_player" ADD CONSTRAINT "FK_f64d81198b89cdabb4844b176cc" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "swiss_round" ADD CONSTRAINT "FK_7e042c8b5f4260ba4a63b82a191" FOREIGN KEY ("tournamentId") REFERENCES "tournament"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "swiss_pairing_record" ADD CONSTRAINT "FK_5ffd7b3996927c75be7befec677" FOREIGN KEY ("roundId") REFERENCES "swiss_round"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "game_history" ADD CONSTRAINT "FK_8e732869b6f55ae4bc1bd8dcd9b" FOREIGN KEY ("lightPlayerId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "game_history" ADD CONSTRAINT "FK_43fc33ca39a18cb3b4a481afb9d" FOREIGN KEY ("darkPlayerId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "friendship" ADD CONSTRAINT "FK_19d92a79d938f4f61a27ca93dfb" FOREIGN KEY ("user1Id") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "friendship" ADD CONSTRAINT "FK_67e0cc82733694bb847a90ce723" FOREIGN KEY ("user2Id") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "club" ADD CONSTRAINT "FK_dcca5ef0fb64063360357aeef91" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "club_post" ADD CONSTRAINT "FK_edda2cf6ba819155453eee16221" FOREIGN KEY ("clubId") REFERENCES "club"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "club_post" ADD CONSTRAINT "FK_86fdec20a8f0f75922de5709529" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "club_membership" ADD CONSTRAINT "FK_c36b17947c5a3dcb319707f0bf0" FOREIGN KEY ("clubId") REFERENCES "club"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "club_membership" ADD CONSTRAINT "FK_6877db858accbe1f93c976e49b2" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "cheat_flag" ADD CONSTRAINT "FK_9ecb294add9d9117f901205d0b4" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "cheat_flag" DROP CONSTRAINT "FK_9ecb294add9d9117f901205d0b4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "club_membership" DROP CONSTRAINT "FK_6877db858accbe1f93c976e49b2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "club_membership" DROP CONSTRAINT "FK_c36b17947c5a3dcb319707f0bf0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "club_post" DROP CONSTRAINT "FK_86fdec20a8f0f75922de5709529"`,
    );
    await queryRunner.query(
      `ALTER TABLE "club_post" DROP CONSTRAINT "FK_edda2cf6ba819155453eee16221"`,
    );
    await queryRunner.query(
      `ALTER TABLE "club" DROP CONSTRAINT "FK_dcca5ef0fb64063360357aeef91"`,
    );
    await queryRunner.query(
      `ALTER TABLE "friendship" DROP CONSTRAINT "FK_67e0cc82733694bb847a90ce723"`,
    );
    await queryRunner.query(
      `ALTER TABLE "friendship" DROP CONSTRAINT "FK_19d92a79d938f4f61a27ca93dfb"`,
    );
    await queryRunner.query(
      `ALTER TABLE "game_history" DROP CONSTRAINT "FK_43fc33ca39a18cb3b4a481afb9d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "game_history" DROP CONSTRAINT "FK_8e732869b6f55ae4bc1bd8dcd9b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "swiss_pairing_record" DROP CONSTRAINT "FK_5ffd7b3996927c75be7befec677"`,
    );
    await queryRunner.query(
      `ALTER TABLE "swiss_round" DROP CONSTRAINT "FK_7e042c8b5f4260ba4a63b82a191"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_player" DROP CONSTRAINT "FK_f64d81198b89cdabb4844b176cc"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_player" DROP CONSTRAINT "FK_e6d2fd1531abe3de6fd8212d882"`,
    );
    await queryRunner.query(`DROP TABLE "game_review"`);
    await queryRunner.query(`DROP TABLE "cheat_flag"`);
    await queryRunner.query(`DROP TABLE "club_membership"`);
    await queryRunner.query(`DROP TABLE "club_post"`);
    await queryRunner.query(`DROP TABLE "club"`);
    await queryRunner.query(`DROP TABLE "friendship"`);
    await queryRunner.query(`DROP TABLE "game_history"`);
    await queryRunner.query(`DROP TABLE "lesson"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_1ced25315eb974b73391fb1c81"`,
    );
    await queryRunner.query(`DROP TABLE "notification"`);
    await queryRunner.query(`DROP TABLE "player_puzzle_rating"`);
    await queryRunner.query(`DROP TABLE "puzzle_rush_session"`);
    await queryRunner.query(`DROP TABLE "puzzle"`);
    await queryRunner.query(`DROP TABLE "player_rating"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_68bbd44d5639ac0b2ba83770de"`,
    );
    await queryRunner.query(`DROP TABLE "rating_history_entry"`);
    await queryRunner.query(`DROP TABLE "swiss_pairing_record"`);
    await queryRunner.query(`DROP TABLE "swiss_round"`);
    await queryRunner.query(`DROP TABLE "tournament"`);
    await queryRunner.query(`DROP TABLE "tournament_player"`);
    await queryRunner.query(`DROP TABLE "user"`);
  }
}
