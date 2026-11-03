import { z } from "zod";
import { orderApi } from "@/lib/order-api";
import { getAgent } from "@/lib/session";
import { approvalToken, refundDecisionHook } from "@/workflows/refund";

const Body = z.object({ approved: z.boolean(), note: z.string().max(500).optional() });

// Resumes the suspended refund workflow with a support lead's decision.
// Hook tokens are guessable by design (derived from the refund ID), so this route is
// the security boundary: only an authenticated support lead can resume one, and the
// approver's identity is stamped into the AWS record by the workflow.
export async function POST(req: Request, { params }: { params: Promise<{ refundId: string }> }) {
  const agent = await getAgent();
  if (!agent) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { refundId } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: "bad request" }, { status: 400 });

  const { refund } = await orderApi.getRefund(refundId);
  if (refund.status !== "PENDING_APPROVAL") {
    return Response.json({ error: `Refund is already ${refund.status.toLowerCase()}` }, { status: 409 });
  }
  try {
    await refundDecisionHook.resume(approvalToken(refundId), { ...parsed.data, decidedBy: agent.email });
  } catch (err) {
    console.error("resume failed", err);
    return Response.json({ error: "This refund isn't waiting on a decision (no active workflow)." }, { status: 409 });
  }
  return Response.json({ ok: true });
}
