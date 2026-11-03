// Durable steps: every call that crosses into AWS (or to the gateway's billing API) is a
// "use step" function. That gives each one automatic retries, a persisted result (a
// replay after a crash or redeploy never re-executes a completed step), and its own
// span in the workflow trace.
//
// Error policy: 4xx from the order API are business answers ("not found", "not
// eligible") and are returned to the model as data, never retried. 5xx/timeouts throw,
// so the workflow runtime retries them with backoff.

import { FatalError } from "workflow";
import { OrderApiError, orderApi, type AgentRunRecord } from "@/lib/order-api";

async function businessCall<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof OrderApiError && err.status < 500) return { error: err.message };
    throw err; // transient: let the step retry
  }
}

export async function listOrdersStep(customerId: string) {
  "use step";
  return businessCall(() => orderApi.listOrders(customerId));
}

export async function getOrderStep(customerId: string, orderId: string) {
  "use step";
  return businessCall(() => orderApi.getOrder(orderId, customerId));
}

export async function trackShipmentStep(customerId: string, orderId: string) {
  "use step";
  return businessCall(() => orderApi.getTracking(orderId, customerId));
}

export async function checkEligibilityStep(customerId: string, orderId: string) {
  "use step";
  return businessCall(() => orderApi.getEligibility(orderId, customerId));
}

export async function createRefundStep(input: {
  customerId: string;
  orderId: string;
  reason: string;
  idempotencyKey: string;
}) {
  "use step";
  // idempotencyKey is derived from (chat run ID, tool call ID). If this step is retried
  // after the AWS write succeeded but before the result was persisted, the API returns
  // the existing refund instead of creating a second one.
  return businessCall(() => orderApi.createRefund(input));
}

export async function transitionRefundStep(
  refundId: string,
  to: "APPROVED" | "DENIED" | "ISSUED",
  note: string,
  decidedBy: string,
) {
  "use step";
  try {
    return (await orderApi.transitionRefund(refundId, to, note, decidedBy)).refund;
  } catch (err) {
    // A 409 means the refund is in a state this transition can't apply to. Retrying
    // won't fix that, so fail the step permanently and surface it in the trace.
    if (err instanceof OrderApiError && err.status === 409) throw new FatalError(err.message);
    throw err;
  }
}

// Stand-in for the payment provider call (e.g. Stripe/Adyen refund API). In the real
// system this is also on the AWS side; it's a separate step so a payout failure retries
// on its own without re-running the approval.
export async function issueRefundStep(refundId: string) {
  "use step";
  return (await orderApi.transitionRefund(refundId, "ISSUED", "Refund sent to original payment method", "system:payments"))
    .refund;
}

export async function recordRunStep(run: AgentRunRecord) {
  "use step";
  await orderApi.recordRun(run);
}
