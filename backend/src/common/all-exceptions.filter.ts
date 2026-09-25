import { ArgumentsHost, Catch, HttpException, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { captureException } from './sentry';
import { errorDetail } from './error-detail';

// Phase 14: every unexpected (5xx / non-HTTP) error is logged with its stack and
// reported to error tracking, then handled exactly as Nest normally would. Expected
// 4xx HttpExceptions (validation, auth, not found) are not reported.
@Catch()
export class AllExceptionsFilter extends BaseExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    if (status >= 500) {
      const type = host.getType();
      const req = type === 'http' ? host.switchToHttp().getRequest() : undefined;
      this.logger.error(`${req ? `${req.method} ${req.url} ` : `[${type}] `}failed: ${errorDetail(exception)}`);
      captureException(exception, req ? { method: req.method, url: req.url, requestId: req.id } : { type });
    }
    if (host.getType() !== 'http') {
      // Socket.IO handlers have their own error path; BaseExceptionFilter is HTTP-only.
      return;
    }
    super.catch(exception, host);
  }
}
