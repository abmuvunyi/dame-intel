import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { User } from './user.entity';
import { UsersController } from './users.controller';
import { PresenceModule } from '../presence/presence.module';

// Global: AuthGuard (used by nearly every module) needs UsersService to check that a
// token's account still exists, isn't banned and hasn't had its sessions revoked.
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([User]), PresenceModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
