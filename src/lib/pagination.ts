import type { PaginatedList } from "./types";

export const DEFAULT_PAGE_SIZE = 100;
export const MAX_PAGE_SIZE = 100;

export type Pagination = {
  offset: number;
  pageSize: number;
};

export type PaginationResult =
  | { pagination: Pagination }
  | { error: string };

function encodeCursor(scope: string, offset: number): string {
  return Buffer.from(JSON.stringify({ scope, offset }), "utf8").toString(
    "base64url",
  );
}

function decodeCursor(cursor: string, scope: string): number | undefined {
  try {
    const value = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as { scope?: unknown; offset?: unknown };
    if (
      value.scope !== scope ||
      typeof value.offset !== "number" ||
      !Number.isSafeInteger(value.offset) ||
      value.offset < 0
    ) {
      return undefined;
    }
    return value.offset;
  } catch {
    return undefined;
  }
}

export function parsePagination(request: Request, scope: string): PaginationResult {
  const params = new URL(request.url).searchParams;
  const rawPageSize = params.get("page_size");
  const pageSize = rawPageSize === null ? DEFAULT_PAGE_SIZE : Number(rawPageSize);
  if (
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > MAX_PAGE_SIZE
  ) {
    return { error: `page_size must be an integer between 1 and ${MAX_PAGE_SIZE}.` };
  }

  const cursor = params.get("start_cursor");
  if (cursor === null) return { pagination: { offset: 0, pageSize } };
  const offset = decodeCursor(cursor, scope);
  if (offset === undefined) {
    return { error: "start_cursor is invalid for this resource." };
  }
  return { pagination: { offset, pageSize } };
}

export function paginate<T>(
  items: T[],
  pagination: Pagination,
  scope: string,
): PaginatedList<T> | { error: string } {
  if (pagination.offset > items.length) {
    return { error: "start_cursor points beyond the end of this resource." };
  }
  const end = Math.min(pagination.offset + pagination.pageSize, items.length);
  const hasMore = end < items.length;
  return {
    object: "list",
    results: items.slice(pagination.offset, end),
    next_cursor: hasMore ? encodeCursor(scope, end) : null,
    has_more: hasMore,
  };
}
