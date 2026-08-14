import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClubsService } from './clubs.service';
import { ClubsController } from './clubs.controller';
import { Club } from './club.entity';
import { ClubMembership } from './club-membership.entity';
import { ClubPost } from './club-post.entity';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Club, ClubMembership, ClubPost]),
    UsersModule,
  ],
  providers: [ClubsService],
  controllers: [ClubsController],
})
export class ClubsModule {}
