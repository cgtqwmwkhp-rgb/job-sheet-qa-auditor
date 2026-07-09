export function isAsyncProcessingEnabled(): boolean {
  return process.env.FEATURE_ASYNC_PROCESSING === "true";
}
