import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { createPagination } from './pagination.util';
import type { Pagination } from './pagination.types';
import locals from '@locals';

type PaginationQuery = {
  page?: string | number;
  limit?: string | number;
  cursor?: string;
};

function toInt(value: string | number | undefined, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

@Injectable()
export class PaginationPipe implements PipeTransform<
  PaginationQuery | undefined | null,
  Pagination
> {
  transform(value: PaginationQuery | undefined | null): Pagination {
    const maxLimit = 150;
    const query = value ?? {};
    const hasPageParam = Object.hasOwn(query, 'page');
    const page = toInt(query.page, 1);
    const limit = toInt(query.limit, 10);
    const rawCursor = query.cursor;
    const cursor =
      typeof rawCursor === 'string' && rawCursor.trim().length > 0
        ? rawCursor.trim()
        : undefined;

    if (!cursor && page < 1) {
      throw new BadRequestException(locals.pagination.page_must_be_at_least_1);
    }

    if (limit < 1 || limit > maxLimit) {
      throw new BadRequestException(
        locals.pagination.limit_must_be_between_1_and_150,
      );
    }

    if (cursor && hasPageParam) {
      throw new BadRequestException(
        locals.pagination.page_cannot_be_combined_with_cursor,
      );
    }

    return createPagination(page, limit, cursor, !hasPageParam);
  }
}
