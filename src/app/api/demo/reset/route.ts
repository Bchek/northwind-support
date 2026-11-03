import { orderApi } from "@/lib/order-api";
import { getAgent } from "@/lib/session";

// Clears refunds in AWS so every reviewer starts from the same state.
export async function POST() {
  if (!(await getAgent())) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(await orderApi.resetDemo());
}
