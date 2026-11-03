import { createModelCallToUIChunkTransform } from "@ai-sdk/workflow";
import { createUIMessageStreamResponse } from "ai";
import type { NextRequest } from "next/server";
import { getRun } from "workflow/api";

// Reconnect endpoint used by WorkflowChatTransport after a dropped connection.
// The durable stream stores raw model parts, so we replay from 0 and let the transform
// skip the UI chunks the client already has.
export async function GET(req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const startIndex = Number(req.nextUrl.searchParams.get("startIndex") ?? "0");
  if (!Number.isSafeInteger(startIndex) || startIndex < 0) {
    return Response.json({ error: "bad startIndex" }, { status: 400 });
  }
  const run = await getRun(runId);
  return createUIMessageStreamResponse({
    stream: run
      .getReadable({ startIndex: 0 })
      .pipeThrough(createModelCallToUIChunkTransform({ uiStartIndex: startIndex })),
    headers: { "x-workflow-run-id": runId },
  });
}
