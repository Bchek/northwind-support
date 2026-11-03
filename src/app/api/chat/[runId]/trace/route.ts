import { getRun } from "workflow/api";
import type { ChatTrace } from "@/workflows/support-chat";
import { getCustomer } from "@/lib/session";

// Returns the finished turn's trace (models, fallback, tokens, cost, tool timings).
// The workflow's return value IS the trace, so there's no second store to keep in sync.
export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const customer = await getCustomer();
  const { runId } = await params;
  const run = await getRun(runId);
  const trace = (await Promise.race([
    run.returnValue,
    new Promise((r) => setTimeout(() => r(null), 15_000)),
  ])) as ChatTrace | null;
  if (!trace) return Response.json({ pending: true }, { status: 202 });
  if (trace.customerId !== customer?.id) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(trace);
}
