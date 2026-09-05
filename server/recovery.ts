export type RecoveryStatus =
  "completed" | "refunded" | "rejected" | "needs-recovery";
/** Reconcile ledger evidence, never infer a refund from an unavailable RPC. */
export async function recoverJob(evidence: {
  state: () => Promise<number>;
  refund: () => Promise<unknown>;
  receipt: () => Promise<"success" | "reverted" | "pending">;
}): Promise<RecoveryStatus> {
  try {
    const state = await evidence.state();
    if (state === 2) return "completed";
    if (state === 3) return "refunded";
    if (state === 1) {
      await evidence.refund();
      return "refunded";
    }
    return (await evidence.receipt()) === "reverted"
      ? "rejected"
      : "needs-recovery";
  } catch {
    return "needs-recovery";
  }
}
