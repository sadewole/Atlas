import { AtlasError } from '@atlas/shared';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';

/**
 * Global exception filter that maps every error to the standardized Atlas
 * error format (API Standards §Error Format):
 *
 * { "error": { "code", "message", "details", "requestId", "correlationId" } }
 *
 * - AtlasError (domain errors) → its own statusCode + code
 * - HttpException (Nest built-in, e.g. validation) → its status + message
 * - anything else → 500 INTERNAL with a generic message (never leak internals)
 */
@Catch()
export class AtlasExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<{
      id?: string;
      headers: Record<string, string | string[] | undefined>;
    }>();
    const correlationId = request.headers['x-correlation-id'] as
      | string
      | undefined;
    const requestId = request.id;

    if (exception instanceof AtlasError) {
      const body = exception
        .withRequestContext({ requestId, correlationId })
        .toResponse();
      reply.status(exception.statusCode).send(body);
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const message =
        typeof response === 'string'
          ? response
          : (response as { message?: string }).message ?? exception.message;
      reply.status(status).send({
        error: {
          code: this.codeForStatus(status),
          message,
          details: [],
          requestId,
          correlationId,
        },
      });
      return;
    }

    // Unknown error — log the real error, respond generically.
    this.logger.error(
      { err: exception, correlationId, requestId },
      'Unhandled exception',
    );
    reply.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
      error: {
        code: 'INTERNAL',
        message: 'Internal server error',
        details: [],
        requestId,
        correlationId,
      },
    });
  }

  private codeForStatus(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'VALIDATION_FAILED';
      case HttpStatus.UNAUTHORIZED:
        return 'AUTH_UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'AUTH_FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      default:
        return 'HTTP_ERROR';
    }
  }
}
