// Northwind Outfitters — Order & Returns API (the customer's EXISTING system).
//
// This Lambda stands in for the retailer's order platform that already lives on AWS.
// It deliberately owns the business rules (return windows, final-sale items, refund
// thresholds). The Vercel-hosted agent never decides eligibility itself — it asks this
// API. That keeps policy in the system of record and means the agent can be swapped,
// re-prompted, or re-modeled without changing what the business allows.
//
// Auth: API Gateway uses AWS_IAM authorization, so every request is SigV4-signed.
// The only principal allowed to invoke it is the IAM role Vercel assumes via OIDC
// (see template.yaml). There are no static API keys anywhere.

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ORDERS = process.env.ORDERS_TABLE;
const REFUNDS = process.env.REFUNDS_TABLE;
const RUNS = process.env.RUNS_TABLE;

const RETURN_WINDOW_DAYS = 30;
// Refunds at or below this amount are auto-approved by policy. Above it, a human
// support lead must approve. The threshold lives here (system of record), not in the agent.
const AUTO_APPROVE_LIMIT = 100;

const json = (statusCode, body) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const parseBody = (event) => {
  if (!event.body) return {};
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;
  return JSON.parse(raw);
};

// The IAM identity that signed the request — recorded on writes for an audit trail.
const callerOf = (event) =>
  event.requestContext?.authorizer?.iam?.userArn ?? "unknown";

async function getOrder(orderId) {
  const { Item } = await db.send(new GetCommand({ TableName: ORDERS, Key: { orderId } }));
  return Item;
}

async function activeRefundFor(orderId) {
  const { Items = [] } = await db.send(
    new ScanCommand({
      TableName: REFUNDS,
      FilterExpression: "orderId = :o AND #s <> :denied",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":o": orderId, ":denied": "DENIED" },
    }),
  );
  return Items[0];
}

// Ownership check: an order is only visible to the customer who placed it.
// Returns 404 (not 403) on mismatch so callers can't probe for valid order IDs.
async function ownedOrder(orderId, customerId) {
  const order = await getOrder(orderId);
  if (!order || order.customerId !== customerId) return undefined;
  return order;
}

async function eligibility(order) {
  if (order.status !== "DELIVERED") {
    return { eligible: false, reason: `Order is ${order.status.toLowerCase()}; returns open after delivery.` };
  }
  const finalSale = order.items.filter((i) => i.finalSale);
  if (finalSale.length === order.items.length) {
    return { eligible: false, reason: "All items in this order were final sale." };
  }
  const days = Math.floor((Date.now() - Date.parse(order.deliveredAt)) / 86_400_000);
  if (days > RETURN_WINDOW_DAYS) {
    return { eligible: false, reason: `Delivered ${days} days ago; the return window is ${RETURN_WINDOW_DAYS} days.` };
  }
  const existing = await activeRefundFor(order.orderId);
  if (existing) {
    return { eligible: false, reason: `A refund (${existing.refundId}) is already ${existing.status.toLowerCase()}.` };
  }
  const refundable = finalSale.length
    ? order.items.filter((i) => !i.finalSale).reduce((s, i) => s + i.price * i.qty, 0)
    : order.total;
  return {
    eligible: true,
    refundableAmount: Math.round(refundable * 100) / 100,
    daysSinceDelivery: days,
    requiresApproval: refundable > AUTO_APPROVE_LIMIT,
    autoApproveLimit: AUTO_APPROVE_LIMIT,
    excludedFinalSaleItems: finalSale.map((i) => i.name),
  };
}

const routes = {
  "GET /customers/{customerId}/orders": async ({ pathParameters: p }) => {
    const { Items = [] } = await db.send(
      new QueryCommand({
        TableName: ORDERS,
        IndexName: "byCustomer",
        KeyConditionExpression: "customerId = :c",
        ExpressionAttributeValues: { ":c": p.customerId },
        ScanIndexForward: false,
      }),
    );
    return json(200, {
      orders: Items.map(({ orderId, placedAt, status, total, items }) => ({
        orderId,
        placedAt,
        status,
        total,
        itemCount: items.length,
        summary: items.map((i) => i.name).join(", "),
      })),
    });
  },

  "GET /orders/{orderId}": async ({ pathParameters: p, queryStringParameters: q }) => {
    const order = await ownedOrder(p.orderId, q?.customerId);
    return order ? json(200, { order }) : json(404, { error: "Order not found" });
  },

  "GET /orders/{orderId}/tracking": async ({ pathParameters: p, queryStringParameters: q }) => {
    const order = await ownedOrder(p.orderId, q?.customerId);
    if (!order) return json(404, { error: "Order not found" });
    if (!order.shipment) return json(200, { tracking: null, note: "Not shipped yet." });
    return json(200, { tracking: order.shipment });
  },

  "GET /orders/{orderId}/return-eligibility": async ({ pathParameters: p, queryStringParameters: q }) => {
    const order = await ownedOrder(p.orderId, q?.customerId);
    if (!order) return json(404, { error: "Order not found" });
    return json(200, { orderId: order.orderId, ...(await eligibility(order)) });
  },

  // Creates a refund. Idempotent on `idempotencyKey` so a retried workflow step
  // can never create a second refund for the same request.
  "POST /refunds": async (event) => {
    const { orderId, customerId, reason, idempotencyKey, workflowRunId } = parseBody(event);
    if (idempotencyKey) {
      const { Items = [] } = await db.send(
        new ScanCommand({
          TableName: REFUNDS,
          FilterExpression: "idempotencyKey = :k",
          ExpressionAttributeValues: { ":k": idempotencyKey },
        }),
      );
      if (Items[0]) return json(200, { refund: Items[0], idempotentReplay: true });
    }
    const order = await ownedOrder(orderId, customerId);
    if (!order) return json(404, { error: "Order not found" });
    const e = await eligibility(order);
    if (!e.eligible) return json(409, { error: e.reason });
    const now = new Date().toISOString();
    const refund = {
      refundId: `RF-${randomUUID().slice(0, 8).toUpperCase()}`,
      orderId,
      customerId,
      customerName: order.customerName,
      amount: e.refundableAmount,
      reason: reason ?? "Not specified",
      status: e.requiresApproval ? "PENDING_APPROVAL" : "APPROVED",
      requiresApproval: e.requiresApproval,
      idempotencyKey: idempotencyKey ?? null,
      // Links the AWS record back to the durable Vercel Workflow run that owns it.
      workflowRunId: workflowRunId ?? null,
      createdAt: now,
      updatedAt: now,
      createdBy: callerOf(event),
    };
    await db.send(new PutCommand({ TableName: REFUNDS, Item: refund }));
    return json(201, { refund });
  },

  "GET /refunds": async ({ queryStringParameters: q }) => {
    const { Items = [] } = await db.send(new ScanCommand({ TableName: REFUNDS }));
    const refunds = Items.filter((r) => !q?.status || r.status === q.status).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
    return json(200, { refunds });
  },

  "GET /refunds/{refundId}": async ({ pathParameters: p }) => {
    const { Item } = await db.send(new GetCommand({ TableName: REFUNDS, Key: { refundId: p.refundId } }));
    return Item ? json(200, { refund: Item }) : json(404, { error: "Refund not found" });
  },

  // Moves a refund through its lifecycle. Conditional writes make each transition
  // safe to retry: re-sending the same transition is a no-op, not a double payout.
  "POST /refunds/{refundId}/transition": async (event) => {
    const { refundId } = event.pathParameters;
    const { to, note, decidedBy } = parseBody(event);
    const allowedFrom = {
      APPROVED: ["PENDING_APPROVAL"],
      DENIED: ["PENDING_APPROVAL"],
      ISSUED: ["APPROVED"],
    }[to];
    if (!allowedFrom) return json(400, { error: `Unknown target status ${to}` });
    try {
      const { Attributes } = await db.send(
        new UpdateCommand({
          TableName: REFUNDS,
          Key: { refundId },
          UpdateExpression: "SET #s = :to, updatedAt = :now, notes = list_append(if_not_exists(notes, :empty), :note)",
          ConditionExpression: "#s IN (" + allowedFrom.map((_, i) => `:f${i}`).join(",") + ")",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: {
            ":to": to,
            ":now": new Date().toISOString(),
            ":empty": [],
            ":note": [{ at: new Date().toISOString(), to, note: note ?? "", by: decidedBy ?? callerOf(event) }],
            ...Object.fromEntries(allowedFrom.map((s, i) => [`:f${i}`, s])),
          },
          ReturnValues: "ALL_NEW",
        }),
      );
      return json(200, { refund: Attributes });
    } catch (err) {
      if (err.name !== "ConditionalCheckFailedException") throw err;
      const { Item } = await db.send(new GetCommand({ TableName: REFUNDS, Key: { refundId } }));
      if (Item?.status === to) return json(200, { refund: Item, idempotentReplay: true });
      return json(409, { error: `Refund is ${Item?.status ?? "missing"}; cannot move to ${to}` });
    }
  },

  // Per-conversation cost/latency records written by the agent. Finance's attribution
  // data stays in the customer's own AWS account next to the orders it relates to.
  "POST /agent-runs": async (event) => {
    const run = parseBody(event);
    await db.send(new PutCommand({ TableName: RUNS, Item: { ...run, recordedAt: new Date().toISOString() } }));
    return json(201, { ok: true });
  },

  "GET /agent-runs": async () => {
    const { Items = [] } = await db.send(new ScanCommand({ TableName: RUNS, Limit: 200 }));
    return json(200, { runs: Items.sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? "")) });
  },

  // Demo-only: clears refunds so every reviewer sees the same starting state.
  "POST /demo/reset": async () => {
    const { Items = [] } = await db.send(new ScanCommand({ TableName: REFUNDS, ProjectionExpression: "refundId" }));
    await Promise.all(Items.map(({ refundId }) => db.send(new DeleteCommand({ TableName: REFUNDS, Key: { refundId } }))));
    return json(200, { cleared: Items.length });
  },
};

export const handler = async (event) => {
  const route = routes[event.routeKey];
  if (!route) return json(404, { error: `No route ${event.routeKey}` });
  try {
    return await route(event);
  } catch (err) {
    console.error(err);
    return json(500, { error: "Internal error" });
  }
};
