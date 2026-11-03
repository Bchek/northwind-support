import { clearAgent } from "@/lib/session";

export async function POST() {
  await clearAgent();
  return Response.json({ ok: true });
}
