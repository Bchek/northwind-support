import "server-only";
import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";
import { personaById } from "./customers";

// Two signed, httpOnly cookies:
//   nw_customer — which demo shopper is "signed in" (stands in for the storefront's IdP)
//   nw_agent    — the support-lead console session
// Signed with HS256 using SESSION_SECRET (a Vercel Sensitive env var). The customer ID
// that scopes every agent tool call comes ONLY from here, never from the request body.

const secret = () => new TextEncoder().encode(process.env.SESSION_SECRET);
const CUSTOMER = "nw_customer";
const AGENT = "nw_agent";

import { DEMO_AGENT_PUBLIC as DEMO_AGENT } from "./demo";
export { DEMO_AGENT };

async function sign(claims: Record<string, string>, ttl: string) {
  return new SignJWT(claims).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(ttl).sign(secret());
}

async function verify(token: string | undefined) {
  if (!token) return undefined;
  try {
    return (await jwtVerify(token, secret())).payload as Record<string, string>;
  } catch {
    return undefined;
  }
}

const cookieOpts = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" };

export async function setCustomer(customerId: string) {
  (await cookies()).set(CUSTOMER, await sign({ customerId }, "7d"), { ...cookieOpts, maxAge: 7 * 86400 });
}

export async function getCustomer() {
  const claims = await verify((await cookies()).get(CUSTOMER)?.value);
  return personaById(claims?.customerId);
}

export async function setAgent() {
  (await cookies()).set(AGENT, await sign({ email: DEMO_AGENT.email, name: DEMO_AGENT.name }, "12h"), {
    ...cookieOpts,
    maxAge: 12 * 3600,
  });
}

export async function getAgent() {
  const claims = await verify((await cookies()).get(AGENT)?.value);
  return claims?.email ? { email: claims.email, name: claims.name } : undefined;
}

export async function clearAgent() {
  (await cookies()).delete(AGENT);
}
