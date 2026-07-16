import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export type ReviewClaimStatus =
  | "idle"
  | "claiming"
  | "claimed"
  | "conflict"
  | "error";

const HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000;

function trpcErrorCode(error: unknown): string | undefined {
  return (error as { data?: { code?: string } } | null)?.data?.code;
}

export function useReviewClaim(jobSheetId: number, enabled = true) {
  const [claimToken, setClaimToken] = useState<string>();
  const [status, setStatus] = useState<ReviewClaimStatus>("idle");
  const [message, setMessage] = useState<string>();
  const claimMutation = trpc.auditActions.claimReview.useMutation();
  const heartbeatMutation = trpc.auditActions.heartbeatClaim.useMutation();
  const releaseMutation = trpc.auditActions.releaseClaim.useMutation();

  useEffect(() => {
    if (!enabled || jobSheetId <= 0) {
      setClaimToken(undefined);
      setStatus("idle");
      setMessage(undefined);
      return;
    }

    let disposed = false;
    let activeToken: string | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    setClaimToken(undefined);
    setStatus("claiming");
    setMessage(undefined);

    void claimMutation
      .mutateAsync({ jobSheetId })
      .then(claim => {
        activeToken = claim.claimToken;
        if (disposed) {
          return releaseMutation.mutateAsync({
            jobSheetId,
            claimToken: claim.claimToken,
          });
        }

        setClaimToken(claim.claimToken);
        setStatus("claimed");
        heartbeat = setInterval(() => {
          void heartbeatMutation
            .mutateAsync({
              jobSheetId,
              claimToken: claim.claimToken,
            })
            .then(renewed => {
              activeToken = renewed.claimToken;
              if (!disposed) setClaimToken(renewed.claimToken);
            })
            .catch(error => {
              if (disposed) return;
              if (heartbeat) clearInterval(heartbeat);
              activeToken = undefined;
              const text =
                error instanceof Error
                  ? error.message
                  : "Review claim could not be renewed";
              setClaimToken(undefined);
              setStatus(
                trpcErrorCode(error) === "CONFLICT" ? "conflict" : "error"
              );
              setMessage(text);
              toast.error(text);
            });
        }, HEARTBEAT_INTERVAL_MS);
      })
      .catch(error => {
        if (disposed) return;
        const text =
          error instanceof Error
            ? error.message
            : "Review could not be claimed";
        const conflict = trpcErrorCode(error) === "CONFLICT";
        setStatus(conflict ? "conflict" : "error");
        setMessage(text);
        toast.error(
          conflict ? `Review claim conflict: ${text}` : `Claim failed: ${text}`
        );
      });

    return () => {
      disposed = true;
      if (heartbeat) clearInterval(heartbeat);
      if (activeToken) {
        void releaseMutation
          .mutateAsync({
            jobSheetId,
            claimToken: activeToken,
          })
          .catch(() => undefined);
      }
    };
    // Mutations are intentionally scoped to the selected sheet lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, jobSheetId]);

  return {
    claimToken,
    status,
    message,
    claimedByYou: status === "claimed",
    canMutate: !enabled || status === "claimed",
  };
}
