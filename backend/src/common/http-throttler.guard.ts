import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

// Phase 14: rate limiting applies to HTTP routes only. Registered globally via
// APP_GUARD, a plain ThrottlerGuard would also run on Socket.IO message handlers,
// where it can't read an HTTP request/response pair. The gateway already has its own
// per-socket chat rate limit (chat-filter.ts).
@Injectable()
export class HttpThrottlerGuard extends ThrottlerGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    return super.canActivate(context);
  }
}
