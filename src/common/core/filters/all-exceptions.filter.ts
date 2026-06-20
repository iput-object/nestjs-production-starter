import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { InjectPinoLogger, type PinoLogger } from 'nestjs-pino';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import type { Request, Response } from 'express';
import locals from '@/locals';

type ErrorResponseBody = {
  success: false;
  statusCode: number;
  message: string | string[];
  data: null;
};

const PRODUCTION_GENERIC_5XX = locals.error.internal_server_error;

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    @InjectPinoLogger(AllExceptionsFilter.name)
    private readonly logger: PinoLogger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') {
      // For ws/rpc contexts we still record on the active span and rethrow.
      this.recordOnSpan(exception);
      this.logger.error({ err: exception }, 'Non-HTTP exception');
      throw exception;
    }

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const statusCode = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const message = this.resolveMessage(exception, isHttpException, statusCode);

    this.recordOnSpan(exception);
    this.log(request, statusCode, message, exception);

    const body: ErrorResponseBody = {
      success: false,
      statusCode,
      message,
      data: null,
    };

    response.status(statusCode).json(body);
  }

  private resolveMessage(
    exception: unknown,
    isHttpException: boolean,
    statusCode: number,
  ): string | string[] {
    const isProduction =
      (process.env.NODE_ENV?.trim() ?? 'development') === 'production';

    // Always preserve client-facing messages for HttpExceptions (4xx + intentional 5xx).
    if (isHttpException) {
      const exceptionResponse = (exception as HttpException).getResponse();
      if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null &&
        'message' in exceptionResponse
      ) {
        return (exceptionResponse as { message: string | string[] }).message;
      }
      return (exception as HttpException).message;
    }

    // Unknown errors → never leak internals in production.
    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR && isProduction) {
      return PRODUCTION_GENERIC_5XX;
    }

    if (exception instanceof Error) {
      return exception.message;
    }
    return PRODUCTION_GENERIC_5XX;
  }

  private recordOnSpan(exception: unknown): void {
    const span = trace.getActiveSpan();
    if (!span) return;
    if (exception instanceof Error) {
      span.recordException(exception);
    } else {
      span.recordException({
        name: 'NonErrorThrow',
        message: typeof exception === 'string' ? exception : 'unknown',
      });
    }
    span.setStatus({ code: SpanStatusCode.ERROR });
  }

  private log(
    request: Request,
    statusCode: number,
    message: string | string[],
    exception: unknown,
  ): void {
    const ctx = {
      method: request.method,
      url: request.originalUrl ?? request.url,
      statusCode,
      message: Array.isArray(message) ? message.join(', ') : message,
    };

    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error({ ...ctx, err: exception }, 'Unhandled exception');
    } else {
      this.logger.warn(ctx, 'Handled HTTP exception');
    }
  }
}
