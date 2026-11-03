// Generates DynamoDB batch-write input for the demo orders.
// Dates are relative to "now" so return windows stay meaningful whenever the
// demo is re-seeded (e.g. right before reviewers look at it).
//
// Each order is chosen to exercise one branch of the support flow:
//   NW-10421  delivered 5d ago, $68        -> refund auto-approved (<= $100)
//   NW-10433  in transit, weather delay    -> tracking / "where is my order"
//   NW-10388  delivered 9d ago, $248       -> refund needs human approval (> $100)
//   NW-10290  delivered 47d ago            -> outside 30-day window, agent must decline
//   NW-10450  processing, not shipped      -> no tracking yet
//   NW-10412  delivered, mixed final sale  -> partial refund, final-sale item excluded

import { writeFileSync } from "node:fs";

const day = 86_400_000;
const ago = (d, hours = 0) => new Date(Date.now() - d * day - hours * 3_600_000).toISOString();
const ahead = (d) => new Date(Date.now() + d * day).toISOString().slice(0, 10);

const customers = {
  "C-1001": { name: "Maya Chen", email: "maya.chen@example.com" },
  "C-1002": { name: "Jordan Rivera", email: "jordan.rivera@example.com" },
  "C-1003": { name: "Sam Patel", email: "sam.patel@example.com" },
};

const order = (o) => {
  const total = Math.round(o.items.reduce((s, i) => s + i.price * i.qty, 0) * 100) / 100;
  const c = customers[o.customerId];
  return { ...o, customerName: c.name, customerEmail: c.email, total, currency: "USD" };
};

const orders = [
  order({
    orderId: "NW-10421",
    customerId: "C-1001",
    placedAt: ago(9),
    status: "DELIVERED",
    deliveredAt: ago(5),
    items: [{ sku: "TEE-MER-BLK-M", name: "Merino Trail Tee (Black, M)", price: 68, qty: 1, finalSale: false }],
    shipment: {
      carrier: "UPS", trackingNumber: "1Z999AA10123456784", status: "DELIVERED",
      events: [
        { at: ago(8), location: "Reno, NV", description: "Shipped" },
        { at: ago(6), location: "Oakland, CA", description: "Out for delivery" },
        { at: ago(5), location: "San Francisco, CA", description: "Delivered — front porch" },
      ],
    },
  }),
  order({
    orderId: "NW-10433",
    customerId: "C-1001",
    placedAt: ago(4),
    status: "IN_TRANSIT",
    items: [
      { sku: "JKT-SHL-OLV-M", name: "Ridgeline Rain Shell (Olive, M)", price: 189, qty: 1, finalSale: false },
      { sku: "SCK-WL-3PK", name: "Wool Hiking Socks (3-pack)", price: 32, qty: 1, finalSale: false },
    ],
    shipment: {
      carrier: "FedEx", trackingNumber: "794644790138", status: "DELAYED",
      estimatedDelivery: ahead(2),
      originalEstimatedDelivery: ahead(0),
      events: [
        { at: ago(3), location: "Reno, NV", description: "Shipped" },
        { at: ago(2), location: "Salt Lake City, UT", description: "In transit" },
        { at: ago(1), location: "Denver, CO", description: "Delayed — severe weather at hub; new estimate issued" },
      ],
    },
  }),
  order({
    orderId: "NW-10388",
    customerId: "C-1002",
    placedAt: ago(14),
    status: "DELIVERED",
    deliveredAt: ago(9),
    items: [{ sku: "JKT-DWN-NVY-L", name: "Summit Down Parka (Navy, L)", price: 248, qty: 1, finalSale: false }],
    shipment: {
      carrier: "UPS", trackingNumber: "1Z999AA10123459912", status: "DELIVERED",
      events: [
        { at: ago(12), location: "Reno, NV", description: "Shipped" },
        { at: ago(9), location: "Austin, TX", description: "Delivered — handed to resident" },
      ],
    },
  }),
  order({
    orderId: "NW-10290",
    customerId: "C-1002",
    placedAt: ago(52),
    status: "DELIVERED",
    deliveredAt: ago(47),
    items: [{ sku: "PNT-TRK-KHK-32", name: "Trekker Pants (Khaki, 32)", price: 89, qty: 1, finalSale: false }],
    shipment: {
      carrier: "USPS", trackingNumber: "9400111899223197428490", status: "DELIVERED",
      events: [{ at: ago(47), location: "Austin, TX", description: "Delivered — mailbox" }],
    },
  }),
  order({
    orderId: "NW-10450",
    customerId: "C-1003",
    placedAt: ago(0, 6),
    status: "PROCESSING",
    items: [{ sku: "PCK-DAY-24L-GRY", name: "Daypack 24L (Graphite)", price: 129, qty: 1, finalSale: false }],
  }),
  order({
    orderId: "NW-10412",
    customerId: "C-1003",
    placedAt: ago(11),
    status: "DELIVERED",
    deliveredAt: ago(7),
    items: [
      { sku: "FLC-ZIP-RST-S", name: "Alpine Fleece Quarter-Zip (Rust, S)", price: 79, qty: 1, finalSale: false },
      { sku: "HAT-BNE-CLR", name: "Clearance Beanie", price: 12, qty: 2, finalSale: true },
    ],
    shipment: {
      carrier: "USPS", trackingNumber: "9400111899223197421111", status: "DELIVERED",
      events: [{ at: ago(7), location: "Brooklyn, NY", description: "Delivered — lobby" }],
    },
  }),
];

// Minimal marshaller for DynamoDB's typed JSON format.
const marshal = (v) => {
  if (v === null || v === undefined) return { NULL: true };
  if (Array.isArray(v)) return { L: v.map(marshal) };
  if (typeof v === "number") return { N: String(v) };
  if (typeof v === "boolean") return { BOOL: v };
  if (typeof v === "object") return { M: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, marshal(x)])) };
  return { S: String(v) };
};

const out = process.argv[2] ?? "seed.json";
writeFileSync(
  out,
  JSON.stringify({
    "northwind-orders": orders.map((o) => ({ PutRequest: { Item: marshal(o).M } })),
  }),
);
console.log(`Wrote ${orders.length} orders to ${out}`);
