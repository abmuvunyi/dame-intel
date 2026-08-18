import { Module } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsController } from './subscriptions.controller';
import { StripeService } from './stripe.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule],
  providers: [SubscriptionsService, StripeService],
  controllers: [SubscriptionsController],
  exports: [StripeService, SubscriptionsService],
})
export class SubscriptionsModule {}
