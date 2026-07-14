/**
 * Review workstation action-feel helpers (UX craft).
 * Keep find↔PDF and post-override navigation snappy without API changes.
 */

/** Instant list scroll — smooth scrolling adds perceptible p95 lag on rapid review. */
export function scrollFindingIntoView(findingId: string | number): void {
  const element = document.getElementById(`finding-${findingId}`);
  if (!element) return;
  element.scrollIntoView({ behavior: "auto", block: "nearest" });
}

/**
 * Pick the next open finding after resolving `resolvedId`.
 * Prefers the item after the resolved one in navigation order, then wraps.
 */
export function nextOpenFindingId(
  navigationFindings: Array<{ id: string | number; status?: string | null }>,
  resolvedId: string | number,
  optimisticPassedIds: ReadonlySet<string | number>
): string | number | null {
  const open = navigationFindings.filter(
    f =>
      f.id !== resolvedId &&
      f.status !== "passed" &&
      !optimisticPassedIds.has(f.id)
  );
  if (open.length === 0) return null;

  const resolvedIdx = navigationFindings.findIndex(f => f.id === resolvedId);
  if (resolvedIdx < 0) return open[0]!.id;

  for (let i = 1; i <= navigationFindings.length; i++) {
    const candidate =
      navigationFindings[(resolvedIdx + i) % navigationFindings.length];
    if (
      candidate &&
      candidate.id !== resolvedId &&
      candidate.status !== "passed" &&
      !optimisticPassedIds.has(candidate.id)
    ) {
      return candidate.id;
    }
  }
  return open[0]!.id;
}
