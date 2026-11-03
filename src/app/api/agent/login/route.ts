import { DEMO_AGENT, setAgent } from "@/lib/session";

export async function POST(req: Request) {
  const { email, password } = (await req.json()) as { email?: string; password?: string };
  if (email?.trim().toLowerCase() !== DEMO_AGENT.email || password !== DEMO_AGENT.password) {
    return Response.json({ error: "Invalid email or password" }, { status: 401 });
  }
  await setAgent();
  return Response.json({ ok: true });
}
