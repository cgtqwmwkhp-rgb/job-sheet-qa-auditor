import { TRPCClientError } from "@trpc/client";

export type ProcessJobSheetResult = {
  deduped?: boolean;
  reason?: string;
  reusedFromJobSheetId?: number;
};

function isProcessDedupeResult(
  value: unknown
): value is ProcessJobSheetResult & { deduped: true } {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as ProcessJobSheetResult).deduped === true
  );
}

export function processDedupeMessage(
  result: ProcessJobSheetResult,
  fileName?: string
): string {
  const label = fileName ? `"${fileName}"` : "This document";
  switch (result.reason) {
    case "already_processed":
      return `${label} matches an already-processed upload — OCR was not run again.`;
    case "in_flight":
      return `${label} is already being processed elsewhere — no duplicate OCR started.`;
    case "same_sheet_processing":
      return `${label} is already processing — please wait.`;
    default:
      return `${label} was not sent for duplicate OCR.`;
  }
}

export function processErrorMessage(error: unknown): string {
  if (error instanceof TRPCClientError) {
    if (error.data?.code === "CONFLICT" && error.message) {
      return error.message;
    }
    if (error.message) {
      return error.message;
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Failed to process document. Please try again.";
}

export function handleProcessJobSheetOutcome(input: {
  result?: unknown;
  error?: unknown;
  fileName?: string;
  onDeduped: (message: string) => void;
  onError: (message: string) => void;
}): "deduped" | "error" | "ok" {
  if (input.error) {
    input.onError(processErrorMessage(input.error));
    return "error";
  }
  if (isProcessDedupeResult(input.result)) {
    input.onDeduped(processDedupeMessage(input.result, input.fileName));
    return "deduped";
  }
  return "ok";
}
