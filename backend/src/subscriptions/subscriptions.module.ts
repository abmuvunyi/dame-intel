import { Module } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsController } from './subscriptions.controller';
import { StripeService } from './stripe.service';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TrialService } from './trial.service';

@Module({
  imports: [UsersModule, NotificationsModule],
  providers: [SubscriptionsService, StripeService, TrialService],
  controllers: [SubscriptionsController],
  exports: [StripeService, SubscriptionsService, TrialService],
})
export class SubscriptionsModule {}
