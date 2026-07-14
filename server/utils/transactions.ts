/**
 * Database Transaction Utilities
 *
 * Provides helpers for wrapping critical multi-step operations in transactions.
 * Ensures atomicity and rollback on errors.
 */

import {
  getDb,
  runTransaction,
  type DbClient,
  type DbExecutor,
  type DbTx,
} from "../db";

export class TransactionError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = "TransactionError";
  }
}

export type { DbClient, DbExecutor, DbTx };

/**
 * Executes a function within a database transaction.
 * Automatically commits on success or rolls back on error.
 */
export async function withTransaction<T>(
  fn: (tx: DbTx) => Promise<T>
): Promise<T> {
  try {
    return await runTransaction(fn);
  } catch (error) {
    throw new TransactionError(
      `Transaction failed: ${(error as Error).message}`,
      error as Error
    );
  }
}

/**
 * Validates that critical operations are idempotent.
 * Prevents duplicate processing by checking state before mutation.
 */
export async function ensureIdempotent<T>(
  checkFn: () => Promise<T>,
  validationFn: (resource: T) => boolean,
  errorMessage: string
): Promise<T> {
  const resource = await checkFn();

  if (!validationFn(resource)) {
    throw new TransactionError(errorMessage);
  }

  return resource;
}
