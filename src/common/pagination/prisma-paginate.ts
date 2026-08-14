/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { Prisma } from '@prisma-client';
import { Pagination, PaginatedResult } from './pagination.types';
import { cursorPaginationMeta, offsetPaginationMeta } from './pagination.meta';
import locals from '@locals';

type CursorPayload = {
  sortValue: unknown;
  cursorValue: unknown;
};

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodeCursor(token: string): CursorPayload | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(token, 'base64url').toString('utf8'),
    ) as CursorPayload;
    if (
      parsed &&
      Object.prototype.hasOwnProperty.call(parsed, 'sortValue') &&
      Object.prototype.hasOwnProperty.call(parsed, 'cursorValue')
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export async function prismaPaginate<
  TDelegate,
  TArgs extends Prisma.Args<TDelegate, 'findMany'>,
>(
  delegate: TDelegate & {
    findMany(args: any): Promise<any>;
    count(args: any): Promise<number>;
  },
  args: TArgs,
  pagination?: Pagination,
  options?: {
    cursorField?: string;
    sortField?: string;
    sortDirection?: 'asc' | 'desc';
  },
): Promise<PaginatedResult<Prisma.Result<TDelegate, TArgs, 'findMany'>>> {
  const cursorField = options?.cursorField ?? 'id';
  const sortField = options?.sortField;
  const sortDirection = options?.sortDirection ?? 'desc';
  const normalizedPagination = pagination || {
    mode: 'offset',
    page: 1,
    limit: 10,
    skip: 0,
  };
  const { limit } = normalizedPagination;

  if (normalizedPagination.mode === 'cursor') {
    const cursorValue = normalizedPagination.cursor;
    const activeSortField = sortField ?? cursorField;
    const directionOp = sortDirection === 'asc' ? 'gt' : 'lt';

    let keysetWhere: Record<string, unknown> | undefined;
    if (cursorValue) {
      const decoded = decodeCursor(cursorValue);

      if (decoded) {
        // Composite keyset condition:
        // (sortField OP sortValue) OR (sortField == sortValue AND cursorField OP cursorValue)
        keysetWhere = {
          OR: [
            { [activeSortField]: { [directionOp]: decoded.sortValue } },
            {
              AND: [
                { [activeSortField]: decoded.sortValue },
                { [cursorField]: { [directionOp]: decoded.cursorValue } },
              ],
            },
          ],
        };
      } else if (activeSortField === cursorField) {
        // Backward compatibility for old plain cursor tokens.
        keysetWhere = {
          [cursorField]: { [directionOp]: cursorValue },
        };
      } else {
        throw new Error(locals.pagination.invalid_cursor_token_for_sort_mode);
      }
    }

    const dataWithExtra = await delegate.findMany({
      ...args,
      take: limit + 1,
      where: keysetWhere
        ? args.where
          ? { AND: [args.where, keysetWhere] }
          : keysetWhere
        : args.where,
      orderBy:
        args.orderBy ??
        (activeSortField === cursorField
          ? { [cursorField]: sortDirection }
          : [
              { [activeSortField]: sortDirection },
              { [cursorField]: sortDirection },
            ]),
    });
    const hasNext = dataWithExtra.length > limit;
    const data = hasNext ? dataWithExtra.slice(0, limit) : dataWithExtra;
    const lastItem = data[data.length - 1] as
      Record<string, unknown> | undefined;
    const nextCursor =
      hasNext && lastItem
        ? encodeCursor({
            sortValue: lastItem[activeSortField],
            cursorValue: lastItem[cursorField],
          })
        : null;

    return {
      data,
      pagination: cursorPaginationMeta(
        limit,
        hasNext,
        cursorValue ?? null,
        nextCursor && nextCursor.length > 0 ? nextCursor : null,
      ),
    };
  }

  const data = await delegate.findMany({
    ...args,
    skip: normalizedPagination.skip,
    take: limit,
  });

  const total = await delegate.count({
    where: args.where,
  });

  return {
    data,
    pagination: offsetPaginationMeta(total, normalizedPagination.page, limit),
  };
}
