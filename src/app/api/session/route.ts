import { personaById } from "@/lib/customers";
import { setCustomer } from "@/lib/session";

// Demo "sign in as" for shoppers. Stands in for the storefront's real login.
export async function POST(req: Request) {
  const { customerId } = (await req.json()) as { customerId: string };
  if (!personaById(customerId)) return Response.json({ error: "unknown customer" }, { status: 400 });
  await setCustomer(customerId);
  return Response.json({ ok: true });
}
