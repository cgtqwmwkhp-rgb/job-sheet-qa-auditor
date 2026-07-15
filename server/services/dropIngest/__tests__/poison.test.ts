import { afterEach, describe, expect, it } from "vitest";
import { classifyDropPoison, quarantineDropPoison } from "../poison";
import {
  clearDeadLetterQueue,
  getFailedJob,
} from "../../../utils/deadLetterQueue";

describe("dropIngest poison classification", () => {
  afterEach(() => {
    clearDeadLetterQueue();
  });

  it("classifies empty / oversized / unsupported as non-recoverable poison", () => {
    expect(
      classifyDropPoison({
        emptyFile: true,
        attempts: 1,
        maxAttempts: 3,
      }).reason
    ).toBe("empty_file");
    expect(
      classifyDropPoison({
        oversized: true,
        attempts: 1,
        maxAttempts: 3,
      }).reason
    ).toBe("oversized");
    expect(
      classifyDropPoison({
        unsupportedType: true,
        attempts: 1,
        maxAttempts: 3,
      }).reason
    ).toBe("unsupported_type");
  });

  it("classifies 4xx permanent HTTP as poison without waiting for max attempts", () => {
    const decision = classifyDropPoison({
      httpStatus: 400,
      message: "BAD_REQUEST",
      attempts: 1,
      maxAttempts: 3,
    });
    expect(decision.isPoison).toBe(true);
    expect(decision.reason).toBe("permanent_http");
    expect(decision.recoverable).toBe(false);
  });

  it("keeps 503 transient until max attempts, then poisons", () => {
    expect(
      classifyDropPoison({
        httpStatus: 503,
        message: "NOT_CONFIGURED",
        attempts: 1,
        maxAttempts: 3,
      }).isPoison
    ).toBe(false);

    const exhausted = classifyDropPoison({
      httpStatus: 503,
      message: "NOT_CONFIGURED",
      attempts: 3,
      maxAttempts: 3,
    });
    expect(exhausted.isPoison).toBe(true);
    expect(exhausted.reason).toBe("max_attempts");
  });

  it("quarantines poison into DLQ with drop metadata", () => {
    const job = quarantineDropPoison({
      dropKey: "folder:/tmp/bad.pdf",
      externalJobId: "drop-folder-bad",
      contentHash: "abc",
      reason: "empty_file",
      message: "Empty file",
      attempts: 1,
    });
    expect(job.recoverable).toBe(false);
    expect(job.stage).toBe("upload");
    expect(job.metadata.dropKey).toBe("folder:/tmp/bad.pdf");
    expect(job.metadata.poisonReason).toBe("empty_file");
    expect(getFailedJob(job.id)?.id).toBe(job.id);
  });
});
