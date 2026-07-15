/**
 * Poison / quarantine helpers for the drop ingest poller.
 *
 * Challenge bar: poison → DLQ (or honest reject); do not retry forever.
 */

import {
  addToDeadLetterQueue,
  type FailedJob,
} from "../../utils/deadLetterQueue";

/** HTTP / ingest outcomes that will never succeed on retry. */
const PERMANENT_HTTP_STATUSES = new Set([
  400, 401, 403, 404, 409, 413, 415, 422,
]);

export type PoisonReason =
  | "empty_file"
  | "oversized"
  | "unsupported_type"
  | "permanent_http"
  | "max_attempts"
  | "corrupt";

export interface PoisonDecision {
  isPoison: boolean;
  reason?: PoisonReason;
  recoverable: boolean;
  message: string;
}

export function classifyDropPoison(params: {
  message?: string;
  httpStatus?: number;
  attempts: number;
  maxAttempts: number;
  emptyFile?: boolean;
  oversized?: boolean;
  unsupportedType?: boolean;
}): PoisonDecision {
  if (params.emptyFile) {
    return {
      isPoison: true,
      reason: "empty_file",
      recoverable: false,
      message: params.message ?? "Empty file",
    };
  }
  if (params.oversized) {
    return {
      isPoison: true,
      reason: "oversized",
      recoverable: false,
      message: params.message ?? "File exceeds max size",
    };
  }
  if (params.unsupportedType) {
    return {
      isPoison: true,
      reason: "unsupported_type",
      recoverable: false,
      message: params.message ?? "Unsupported file type",
    };
  }

  const status = params.httpStatus;
  if (status != null && PERMANENT_HTTP_STATUSES.has(status)) {
    return {
      isPoison: true,
      reason: "permanent_http",
      recoverable: false,
      message: params.message ?? `Permanent ingest rejection (HTTP ${status})`,
    };
  }

  const msg = (params.message ?? "").toLowerCase();
  if (
    /unsupported filetype|contenthash does not match|externaljobid already ingested with a different|bad_request|conflict/.test(
      msg
    )
  ) {
    return {
      isPoison: true,
      reason: "corrupt",
      recoverable: false,
      message: params.message ?? "Corrupt or conflicting ingest payload",
    };
  }

  if (params.attempts >= params.maxAttempts) {
    return {
      isPoison: true,
      reason: "max_attempts",
      recoverable: false,
      message:
        params.message ??
        `Exceeded max ingest attempts (${params.maxAttempts})`,
    };
  }

  return {
    isPoison: false,
    recoverable: true,
    message: params.message ?? "Transient ingest failure",
  };
}

/**
 * Quarantine a poison drop into the DLQ.
 * Uses jobSheetId when known; otherwise 0 (in-memory quarantine — DB FK may skip).
 */
export function quarantineDropPoison(params: {
  dropKey: string;
  externalJobId?: string;
  contentHash?: string;
  reason: PoisonReason;
  message: string;
  attempts: number;
  jobSheetId?: number | null;
  httpStatus?: number;
}): FailedJob {
  const error = Object.assign(new Error(params.message), {
    code: `DROP_POISON_${params.reason.toUpperCase()}`,
  });

  return addToDeadLetterQueue(params.jobSheetId ?? 0, "upload", error, {
    recoverable: false,
    attempts: params.attempts,
    maxAttempts: params.attempts,
    metadata: {
      source: "dropIngest",
      dropKey: params.dropKey,
      externalJobId: params.externalJobId,
      contentHash: params.contentHash,
      poisonReason: params.reason,
      httpStatus: params.httpStatus,
      quarantinedAt: new Date().toISOString(),
    },
  });
}
