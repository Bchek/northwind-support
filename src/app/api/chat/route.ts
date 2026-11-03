import { createModelCallToUIChunkTransform } from "@ai-sdk/workflow";
import { createUIMessageStreamResponse, type UIMessage } from "ai";
import { start } from "workflow/api";
import { DEFAULT_MODEL, isAllowedModel } from "@/lib/models";
import { getCustomer } from "@/lib/session";
import { supportChat } from "@/workflows/support-chat";

// Starts one durable chat turn and streams it back. The route itself holds no agent
// state: if this connection drops, the client reconnects to the same run via
// /api/chat/[runId]/stream and replays from where it left off.
export async function POST(req: Request) {
  const customer = await getCustomer();
  if (!customer) return Response.json({ error: "Pick a customer first" }, { status: 401 });

  const body = (await req.json()) as { messages: UIMessage[]; model?: string; simulateOutage?: boolean };
  // Only allow-listed models: the client can choose among them, not inject arbitrary IDs.
  const model = body.model && isAllowedModel(body.model) ? body.model : DEFAULT_MODEL;
  // Keep only the last 20 messages: bounds prompt size (and cost) on long conversations.
  const messages = body.messages.slice(-20);

  const run = await start(supportChat, [
    { messages, customerId: customer.id, model, simulateOutage: Boolean(body.simulateOutage) },
  ]);

  return createUIMessageStreamResponse({
    stream: run.readable.pipeThrough(createModelCallToUIChunkTransform()),
    headers: { "x-workflow-run-id": run.runId },
  });
}
