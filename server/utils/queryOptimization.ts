/**
 * Query Optimization Utilities
 *
 * Helpers for efficient database queries with pagination, filtering, and sorting.
 * Reduces database load and improves response times.
 *
 * @module queryOptimization
 *
 * @example
 * // Basic pagination
 * const result = await paginateQuery(
 *   db.select().from(jobSheets),
 *   { page: 1, limit: 20 }
 * );
 *
 * // With filtering and sorting
 * const result = await optimizeQuery(db, jobSheets, {
 *   filters: { status: 'completed' },
 *   sort: { field: 'createdAt', order: 'desc' },
 *   pagination: { page: 1, limit: 20 }
 * });
 */

import { SQL, sql } from "drizzle-orm";

/**
 * Pagination parameters
 */
export interface PaginationParams {
  page: number; // 1-indexed
  limit: number; // items per page
}

/**
 * Sort parameters
 */
export interface SortParams<T = string> {
  field: T;
  order: "asc" | "desc";
}

/**
 * Filter parameters
 */
export type FilterParams = Record<string, any>;

/**
 * Query optimization options
 */
export interface QueryOptions<T = string> {
  pagination?: PaginationParams;
  sort?: SortParams<T>;
  filters?: FilterParams;
}

/**
 * Paginated result
 */
export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

/**
 * Calculate pagination offset
 */
export function calculateOffset(page: number, limit: number): number {
  return (page - 1) * limit;
}

/**
 * Calculate total pages
 */
export function calculateTotalPages(total: number, limit: number): number {
  return Math.ceil(total / limit);
}

/**
 * Validate pagination parameters
 */
export function validatePaginationParams(
  params: Partial<PaginationParams>
): PaginationParams {
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(100, Math.max(1, params.limit || 20)); // Max 100 items
  return { page, limit };
}

/**
 * Create pagination metadata
 */
export function createPaginationMeta(
  page: number,
  limit: number,
  total: number
): PaginatedResult<any>["pagination"] {
  const totalPages = calculateTotalPages(total, limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

/**
 * Apply pagination to query
 *
 * @example
 * const query = db.select().from(users);
 * const paginated = applyPagination(query, { page: 2, limit: 10 });
 */
export function applyPagination<T>(
  query: any,
  params: PaginationParams
): typeof query {
  const { page, limit } = validatePaginationParams(params);
  const offset = calculateOffset(page, limit);

  return query.limit(limit).offset(offset);
}

/**
 * Apply sorting to query
 *
 * @example
 * const query = db.select().from(users);
 * const sorted = applySorting(query, users, { field: 'createdAt', order: 'desc' });
 */
export function applySorting<T>(
  query: any,
  table: any,
  params: SortParams
): typeof query {
  const { field, order } = params;
  const column = table[field];

  if (!column) {
    console.warn(`Sort field "${field}" not found in table`);
    return query;
  }

  return order === "desc"
    ? query.orderBy(sql`${column} DESC`)
    : query.orderBy(column);
}

/**
 * Build WHERE conditions from filters
 *
 * @example
 * const filters = { status: 'completed', userId: 123 };
 * const conditions = buildFilterConditions(jobSheets, filters);
 */
export function buildFilterConditions(
  table: any,
  filters: FilterParams
): SQL[] {
  const conditions: SQL[] = [];

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null) continue;

    const column = table[key];
    if (!column) {
      console.warn(`Filter field "${key}" not found in table`);
      continue;
    }

    // Handle array values (IN clause)
    if (Array.isArray(value)) {
      if (value.length > 0) {
        conditions.push(sql`${column} IN ${value}`);
      }
    }
    // Handle string pattern matching (LIKE)
    else if (typeof value === "string" && value.includes("%")) {
      conditions.push(sql`${column} LIKE ${value}`);
    }
    // Handle exact match
    else {
      conditions.push(sql`${column} = ${value}`);
    }
  }

  return conditions;
}

/**
 * Optimize query with pagination, sorting, and filtering
 *
 * @example
 * const result = await optimizeQuery(db, jobSheets, {
 *   filters: { status: 'completed', uploadedBy: userId },
 *   sort: { field: 'createdAt', order: 'desc' },
 *   pagination: { page: 1, limit: 20 }
 * });
 */
export async function optimizeQuery<T>(
  db: any,
  table: any,
  options: QueryOptions
): Promise<PaginatedResult<T>> {
  const { pagination, sort, filters } = options;

  // Build base query
  let query = db.select().from(table);

  // Apply filters
  if (filters) {
    const conditions = buildFilterConditions(table, filters);
    if (conditions.length > 0) {
      query = query.where(sql.join(conditions, sql` AND `));
    }
  }

  // Get total count before pagination
  const countQuery = db.select({ count: sql<number>`COUNT(*)` }).from(table);
  if (filters) {
    const conditions = buildFilterConditions(table, filters);
    if (conditions.length > 0) {
      countQuery.where(sql.join(conditions, sql` AND `));
    }
  }
  const [{ count: total }] = await countQuery;

  // Apply sorting
  if (sort) {
    query = applySorting(query, table, sort);
  }

  // Apply pagination
  if (pagination) {
    query = applyPagination(query, pagination);
  }

  // Execute query
  const data = await query;

  // Build result
  const paginationMeta = pagination
    ? createPaginationMeta(pagination.page, pagination.limit, total)
    : {
        page: 1,
        limit: data.length,
        total,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      };

  return {
    data,
    pagination: paginationMeta,
  };
}

/**
 * Create cursor-based pagination for infinite scroll
 * More efficient than offset pagination for large datasets
 *
 * @example
 * const result = await cursorPaginate(
 *   db.select().from(jobSheets),
 *   { cursor: lastId, limit: 20 },
 *   jobSheets.id
 * );
 */
export async function cursorPaginate<T>(
  query: any,
  params: { cursor?: number | string; limit: number },
  cursorField: any
): Promise<{ data: T[]; nextCursor: number | string | null }> {
  const { cursor, limit } = params;

  // Apply cursor filter
  if (cursor) {
    query = query.where(sql`${cursorField} > ${cursor}`);
  }

  // Fetch one extra to determine if there's a next page
  query = query.limit(limit + 1);

  const results = await query;
  const hasNext = results.length > limit;
  const data = hasNext ? results.slice(0, limit) : results;
  const nextCursor = hasNext ? data[data.length - 1][cursorField.name] : null;

  return {
    data,
    nextCursor,
  };
}

/**
 * Index suggestion helper
 * Analyzes query patterns and suggests indexes
 *
 * @example
 * const suggestions = analyzeQueryForIndexes(
 *   { status: 'completed', uploadedBy: 123 },
 *   { field: 'createdAt', order: 'desc' }
 * );
 * // Returns: ["CREATE INDEX idx_status ON table(status)", ...]
 */
export function analyzeQueryForIndexes(
  filters?: FilterParams,
  sort?: SortParams
): string[] {
  const suggestions: string[] = [];

  // Suggest indexes for frequently filtered fields
  if (filters) {
    for (const field of Object.keys(filters)) {
      suggestions.push(`Consider adding index on: ${field}`);
    }
  }

  // Suggest composite index for filter + sort
  if (filters && sort) {
    const filterFields = Object.keys(filters).join(", ");
    suggestions.push(
      `Consider composite index: (${filterFields}, ${sort.field})`
    );
  }

  // Suggest index for sort field
  if (sort && !filters?.[sort.field]) {
    suggestions.push(`Consider adding index on: ${sort.field}`);
  }

  return suggestions;
}

/**
 * Query performance monitor
 * Logs slow queries for optimization
 */
export async function monitorQueryPerformance<T>(
  queryName: string,
  queryFn: () => Promise<T>,
  slowThresholdMs: number = 1000
): Promise<T> {
  const startTime = Date.now();

  try {
    const result = await queryFn();
    const duration = Date.now() - startTime;

    if (duration > slowThresholdMs) {
      console.warn(`[SlowQuery] ${queryName} took ${duration}ms`);
    }

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(
      `[QueryError] ${queryName} failed after ${duration}ms`,
      error
    );
    throw error;
  }
}
