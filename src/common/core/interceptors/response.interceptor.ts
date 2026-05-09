import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { Request, Response } from 'express';
import { PaginationMeta } from '@/common/pagination/pagination.types';
import locals from '@/locals';

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  statusCode: number;
  data?: T | null;
  metadata?: Record<string, unknown>;
  pagination?: PaginationMeta;
  [key: string]: unknown;
}

export interface ServiceResponse<T> {
  message?: string;
  data?: T;
  metadata?: Record<string, unknown>;
  pagination?: PaginationMeta;
  /**
   * Top-level keys spread alongside `success`/`message`/`statusCode`.
   * Use when an endpoint's payload should sit at the root rather than under `data`.
   */
  root?: Record<string, unknown>;
}

function isServiceResponse<T>(value: unknown): value is ServiceResponse<T> {
  if (value === null || typeof value !== 'object') return false;
  return 'data' in value || 'root' in value;
}

@Injectable()
export class TransformResponseInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T>> {
    const ctx = context.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = context.switchToHttp().getRequest<Request>();

    return next.handle().pipe(
      map((returned: unknown) => {
        const statusCode = response.statusCode ?? HttpStatus.OK;

        if (isServiceResponse<T>(returned)) {
          const { message, data, metadata, pagination, root } = returned;
          return {
            success: true,
            message:
              message ??
              response.locals?.message ??
              this.defaultMessage(statusCode, request.method),
            statusCode,
            ...(data !== undefined && { data }),
            ...(metadata && { metadata }),
            ...(pagination && { pagination }),
            ...(root ?? {}),
          };
        }

        return {
          success: true,
          message:
            response.locals?.message ??
            this.defaultMessage(statusCode, request.method),
          statusCode,
          ...(returned !== undefined &&
            returned !== null && { data: returned as T }),
        };
      }),
    );
  }

  private defaultMessage(statusCode: number, method: string): string {
    if (statusCode === HttpStatus.CREATED) {
      return locals.response.resource_created_successfully;
    }

    if (statusCode === HttpStatus.NO_CONTENT) {
      return locals.response.no_content;
    }

    const messagesByMethod: Record<string, string> = {
      GET: locals.response.data_fetched_successfully,
      POST: locals.response.request_completed_successfully,
      PUT: locals.response.resource_updated_successfully,
      PATCH: locals.response.resource_updated_successfully,
      DELETE: locals.response.resource_deleted_successfully,
    };

    return (
      messagesByMethod[method] ?? locals.response.request_completed_successfully
    );
  }
}
