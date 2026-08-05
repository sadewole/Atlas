/**
 * Cursor-based pagination, per the API Standards.
 *
 * Response shape:
 * {
 *   "data": [...],
 *   "page": { "nextCursor": "...", "hasMore": true }
 * }
 */

export interface CursorPage<T> {
  data: T[];
  page: {
    nextCursor?: string;
    hasMore: boolean;
  };
}

export interface PaginationParams {
  /** Maximum number of items per page. Default 50, max 100. */
  limit?: number;
  /** Opaque cursor from the previous page. */
  cursor?: string;
}

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;

export function normalizeLimit(raw?: number): number {
  if (raw === undefined || Number.isNaN(raw) || raw <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.min(raw, MAX_LIMIT);
}

/**
 * Build a page. Pass `items.length === limit + 1` when you fetched one extra
 * row to detect whether another page exists.
 */
export function createCursorPage<T>(
  items: T[],
  hasMore: boolean,
  encodeCursor: (lastItem: T) => string,
): CursorPage<T> {
  const data = hasMore ? items.slice(0, -1) : items;
  const last = data[data.length - 1];
  return {
    data,
    page: {
      nextCursor: hasMore && last ? encodeCursor(last) : undefined,
      hasMore,
    },
  };
}
