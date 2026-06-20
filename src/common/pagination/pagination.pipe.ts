import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { createPagination } from './pagination.util';
import { Pagination } from './pagination.types';
import locals from '@locals';

@Injectable()
export class PaginationPipe implements PipeTransform {
  transform(value: any): Pagination {
    const maxLimit = 150;
    const hasPageParam = Object.prototype.hasOwnProperty.call(
      value ?? {},
      'page',
    );
    const page = parseInt(value?.page) || 1;
    const limit = parseInt(value?.limit) || 10;
    const cursor =
      typeof value?.cursor === 'string' && value.cursor.trim().length > 0
        ? value.cursor.trim()
        : undefined;

    if (!cursor && page < 1) {
      throw new BadRequestException(locals.pagination.page_must_be_at_least_1);
    }

    if (limit < 1 || limit > maxLimit) {
      throw new BadRequestException(
        locals.pagination.limit_must_be_between_1_and_150,
      );
    }

    if (cursor && value?.page) {
      throw new BadRequestException(
        locals.pagination.page_cannot_be_combined_with_cursor,
      );
    }

    return createPagination(page, limit, cursor, !hasPageParam);
  }
}
