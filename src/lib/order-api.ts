// Server-side only (it signs with AWS credentials). Not marked `import "server-only"`
// because workflow step bundles run outside the react-server condition and would throw.
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";
import { AwsClient } from "aws4fetch";

// Client for the customer's existing Order & Returns API on AWS.
//
// How the boundary is crossed:
//   1. Vercel injects a short-lived OIDC token into every function invocation
//      (locally, `vercel env pull` writes one to .env.local).
//   2. We exchange it with AWS STS (AssumeRoleWithWebIdentity) for temporary credentials
//      on a role that can ONLY call execute-api:Invoke on this one API.
//   3. Every request is SigV4-signed; API Gateway rejects anything unsigned (HTTP 403).
// No AWS access keys exist in Vercel — rotating/revoking is done on the AWS side by
// editing the role's trust policy.
//
// In production the network path would run through Vercel Secure Compute (static
// egress IPs / VPC peering) if the API were private; here it is a public regional
// endpoint protected by IAM.

const API_URL = process.env.NORTHWIND_API_URL!;
const REGION = process.env.NORTHWIND_AWS_REGION ?? "us-east-1";
const ROLE_ARN = process.env.NORTHWIND_AWS_ROLE_ARN!;

const provider = awsCredentialsProvider({
  roleArn: ROLE_ARN,
  roleSessionName: "northwind-support-agent",
  clientConfig: { region: REGION },
});

// Credentials are cached per function instance until 2 minutes before expiry. With
// Fluid Compute, one warm instance serves many concurrent requests, so most calls
// reuse the same STS session instead of hitting STS each time.
let cached: { client: AwsClient; expiresAt: number } | undefined;

async function client(): Promise<AwsClient> {
  if (cached && cached.expiresAt - Date.now() > 120_000) return cached.client;
  const creds = await provider();
  cached = {
    client: new AwsClient({
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      sessionToken: creds.sessionToken,
      service: "execute-api",
      region: REGION,
    }),
    expiresAt: creds.expiration?.getTime() ?? Date.now() + 15 * 60_000,
  };
  return cached.client;
}

export class OrderApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const aws = await client();
  const res = await aws.fetch(`${API_URL}${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    // A hung upstream should fail fast and let the workflow step retry, rather than
    // holding the function open.
    signal: AbortSignal.timeout(8_000),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new OrderApiError(res.status, data.error ?? `HTTP ${res.status}`);
  return data;
}

// ---------- Types mirror the AWS API's responses ----------
export type OrderItem = { sku: string; name: string; price: number; qty: number; finalSale: boolean };
export type TrackingEvent = { at: string; location: string; description: string };
export type Shipment = {
  carrier: string;
  trackingNumber: string;
  status: string;
  estimatedDelivery?: string;
  originalEstimatedDelivery?: string;
  events: TrackingEvent[];
};
export type Order = {
  orderId: string;
  customerId: string;
  customerName: string;
  placedAt: string;
  status: "PROCESSING" | "IN_TRANSIT" | "DELIVERED";
  deliveredAt?: string;
  total: number;
  items: OrderItem[];
  shipment?: Shipment;
};
export type OrderSummary = Pick<Order, "orderId" | "placedAt" | "status" | "total"> & {
  itemCount: number;
  summary: string;
};
export type Eligibility =
  | { orderId: string; eligible: false; reason: string }
  | {
      orderId: string;
      eligible: true;
      refundableAmount: number;
      daysSinceDelivery: number;
      requiresApproval: boolean;
      autoApproveLimit: number;
      excludedFinalSaleItems: string[];
    };
export type RefundStatus = "PENDING_APPROVAL" | "APPROVED" | "DENIED" | "ISSUED";
export type Refund = {
  refundId: string;
  orderId: string;
  customerId: string;
  customerName: string;
  amount: number;
  reason: string;
  status: RefundStatus;
  requiresApproval: boolean;
  createdAt: string;
  updatedAt: string;
  workflowRunId?: string;
  notes?: { at: string; to: RefundStatus; note: string; by: string }[];
};
export type AgentRunRecord = {
  runId: string;
  customerId: string;
  startedAt: string;
  durationMs: number;
  requestedModel: string;
  modelsUsed: string[];
  providersUsed: string[];
  fellBack: boolean;
  steps: number;
  toolCalls: { name: string; ms: number }[];
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  generationIds: string[];
  firstUserMessage: string;
};

const q = (customerId: string) => `?customerId=${encodeURIComponent(customerId)}`;

export const orderApi = {
  listOrders: (customerId: string) =>
    call<{ orders: OrderSummary[] }>("GET", `/customers/${encodeURIComponent(customerId)}/orders`),
  getOrder: (orderId: string, customerId: string) =>
    call<{ order: Order }>("GET", `/orders/${encodeURIComponent(orderId)}${q(customerId)}`),
  getTracking: (orderId: string, customerId: string) =>
    call<{ tracking: Shipment | null; note?: string }>(
      "GET",
      `/orders/${encodeURIComponent(orderId)}/tracking${q(customerId)}`,
    ),
  getEligibility: (orderId: string, customerId: string) =>
    call<Eligibility>("GET", `/orders/${encodeURIComponent(orderId)}/return-eligibility${q(customerId)}`),
  createRefund: (input: { orderId: string; customerId: string; reason: string; idempotencyKey: string }) =>
    call<{ refund: Refund; idempotentReplay?: boolean }>("POST", "/refunds", input),
  listRefunds: (status?: RefundStatus) =>
    call<{ refunds: Refund[] }>("GET", `/refunds${status ? `?status=${status}` : ""}`),
  getRefund: (refundId: string) => call<{ refund: Refund }>("GET", `/refunds/${encodeURIComponent(refundId)}`),
  transitionRefund: (refundId: string, to: "APPROVED" | "DENIED" | "ISSUED", note: string, decidedBy: string) =>
    call<{ refund: Refund }>("POST", `/refunds/${encodeURIComponent(refundId)}/transition`, { to, note, decidedBy }),
  recordRun: (run: AgentRunRecord) => call<{ ok: true }>("POST", "/agent-runs", run),
  listRuns: () => call<{ runs: AgentRunRecord[] }>("GET", "/agent-runs"),
  resetDemo: () => call<{ cleared: number }>("POST", "/demo/reset"),
};
