// Refund lifecycle as a durable workflow, separate from the chat.
//
// Why separate: a human approval can take hours. The customer's chat turn shouldn't
// hold a request open (or die with a closed browser tab) while a support lead gets to
// it. The chat creates the refund and starts this workflow; this workflow owns
// everything after that and survives crashes, redeploys, and days of waiting.
//
//   created (AWS) ──► APPROVED by policy (<= $100) ──────────────┐
//        │                                                       ▼
//        └──► PENDING_APPROVAL ──► wait for human (hook) ──► APPROVED ──► ISSUED
//                                     │            │
//                                     │            └──► DENIED
//                                     └── 72h SLA ──► DENIED + escalated
//
// While waiting on the hook the workflow is suspended: it consumes no compute.

import { defineHook, sleep } from "workflow";
import { z } from "zod";
import { issueRefundStep, transitionRefundStep } from "./steps";

export const refundDecisionHook = defineHook({
  schema: z.object({
    approved: z.boolean(),
    note: z.string().max(500).optional(),
    decidedBy: z.string(),
  }),
});

// Deterministic token: the console can resume a refund knowing only its ID, without
// storing a mapping. Tokens are only accepted by the authenticated /api/refunds route.
export const approvalToken = (refundId: string) => `refund-approval:${refundId}`;

export const APPROVAL_SLA = "72h";

export async function refundWorkflow(refund: { refundId: string; status: string; amount: number }) {
  "use workflow";

  if (refund.status === "PENDING_APPROVAL") {
    const hook = refundDecisionHook.create({ token: approvalToken(refund.refundId) });
    const decision = await Promise.race([
      hook.then((d) => d),
      sleep(APPROVAL_SLA).then(() => "timeout" as const),
    ]);

    if (decision === "timeout") {
      await transitionRefundStep(
        refund.refundId,
        "DENIED",
        `No decision within ${APPROVAL_SLA}; escalated to the support queue`,
        "system:sla",
      );
      return { refundId: refund.refundId, outcome: "EXPIRED" as const };
    }
    if (!decision.approved) {
      await transitionRefundStep(refund.refundId, "DENIED", decision.note ?? "", decision.decidedBy);
      return { refundId: refund.refundId, outcome: "DENIED" as const };
    }
    await transitionRefundStep(refund.refundId, "APPROVED", decision.note ?? "", decision.decidedBy);
  }

  // Auto-approved (<= $100 by policy) or human-approved: pay out.
  await issueRefundStep(refund.refundId);
  return { refundId: refund.refundId, outcome: "ISSUED" as const };
}
