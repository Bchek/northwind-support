import type { Metadata } from "next";
import { Suspense } from "react";
import { AgentLogin, AutoRefresh, DecisionButtons, HeaderActions } from "@/components/console-actions";
import { Badge, Card, Label, STATUS_TONE, microUsd, statusLabel, usd } from "@/components/ui";
import { personaById } from "@/lib/customers";
import { DEMO_AGENT_PUBLIC } from "@/lib/demo";
import { orderApi, type AgentRunRecord, type Refund } from "@/lib/order-api";
import { getAgent } from "@/lib/session";

export const metadata: Metadata = { title: "Support console" };

// Everything here is live AWS data and depends on who is signed in, so nothing is
// cached. The page shell is static; the console streams in behind Suspense.
export default function ConsolePage() {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-8">
      <Suspense fallback={<p className="text-sm text-gray-400">Loading console…</p>}>
        <Gate />
      </Suspense>
    </main>
  );
}

async function Gate() {
  const agent = await getAgent();
  if (!agent) {
    return (
      <div className="mx-auto max-w-sm pt-10">
        <h1 className="text-xl font-semibold tracking-tight">Support console</h1>
        <p className="mt-1 text-sm text-gray-600">For Northwind support leads. The demo credentials are filled in.</p>
        <Card className="mt-6 p-5">
          <AgentLogin defaultEmail={DEMO_AGENT_PUBLIC.email} defaultPassword={DEMO_AGENT_PUBLIC.password} />
        </Card>
      </div>
    );
  }
  return <Console agentName={agent.name} />;
}

async function Console({ agentName }: { agentName: string }) {
  // Both reads cross the boundary into AWS, in parallel.
  const [{ refunds }, { runs }] = await Promise.all([orderApi.listRefunds(), orderApi.listRuns()]);
  const pending = refunds.filter((r) => r.status === "PENDING_APPROVAL");
  const issued = refunds.filter((r) => r.status === "ISSUED");
  const priced = runs.filter((r) => r.costUsd >= 0);
  const avgCost = priced.length ? priced.reduce((s, r) => s + r.costUsd, 0) / priced.length : 0;
  const fallbackRate = runs.length ? runs.filter((r) => r.fellBack).length / runs.length : 0;
  const automated = refunds.filter((r) => !r.requiresApproval).length;

  return (
    <>
      <AutoRefresh />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Support console</h1>
          <p className="mt-1 text-sm text-gray-600">Signed in as {agentName}</p>
        </div>
        <HeaderActions />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Awaiting approval" value={String(pending.length)} highlight={pending.length > 0} />
        <Kpi label="Refunded" value={usd(issued.reduce((s, r) => s + r.amount, 0))} />
        <Kpi label="Auto-approved by policy" value={`${automated} of ${refunds.length}`} />
        <Kpi label="Avg AI cost per turn" value={microUsd(avgCost)} />
        <Kpi label="Turns that failed over" value={`${Math.round(fallbackRate * 100)}%`} />
      </div>

      <section className="mt-8 grid gap-6 lg:grid-cols-[360px_1fr]">
        <div>
          <Label>Approval queue</Label>
          <div className="mt-2 space-y-3">
            {pending.length === 0 ? (
              <Card className="p-5 text-sm text-gray-500">
                Nothing waiting. Ask for a refund over $100 in the customer chat (try Jordan&apos;s parka) and it shows up
                here.
              </Card>
            ) : (
              pending.map((r) => <PendingRefund key={r.refundId} refund={r} />)
            )}
          </div>
        </div>
        <div>
          <Label>All refunds</Label>
          <Card className="mt-2 overflow-x-auto">
            <RefundTable refunds={refunds} />
          </Card>
        </div>
      </section>

      <section className="mt-8">
        <Label>Recent conversation turns</Label>
        <Card className="mt-2 overflow-x-auto">
          <RunTable runs={runs.slice(0, 25)} />
        </Card>
      </section>
    </>
  );
}

function Kpi({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Card className={`p-4 ${highlight ? "border-amber/30 bg-amber-soft" : ""}`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </Card>
  );
}

function ago(iso: string) {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function PendingRefund({ refund: r }: { refund: Refund }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-gray-500">{r.refundId}</span>
        <span className="text-xs text-gray-500">{ago(r.createdAt)}</span>
      </div>
      <div className="mt-2 flex items-baseline justify-between">
        <span className="text-xl font-semibold tabular-nums">{usd(r.amount)}</span>
        <span className="text-sm text-gray-600">{r.customerName}</span>
      </div>
      <div className="mt-1 text-sm text-gray-600">
        Order <span className="font-mono">{r.orderId}</span> · &ldquo;{r.reason}&rdquo;
      </div>
      <p className="mt-2 text-xs text-gray-500">
        Eligible under policy, but over the $100 auto-approve limit. The workflow is paused until you decide (72-hour SLA).
      </p>
      <DecisionButtons refundId={r.refundId} />
    </Card>
  );
}

function RefundTable({ refunds }: { refunds: Refund[] }) {
  if (!refunds.length) return <div className="p-5 text-sm text-gray-500">No refunds yet.</div>;
  return (
    <table className="w-full text-sm">
      <thead className="border-b border-gray-200 text-left text-xs text-gray-500">
        <tr>
          <th className="px-4 py-2 font-medium">Refund</th>
          <th className="px-4 py-2 font-medium">Customer</th>
          <th className="px-4 py-2 font-medium">Order</th>
          <th className="px-4 py-2 text-right font-medium">Amount</th>
          <th className="px-4 py-2 font-medium">Status</th>
          <th className="px-4 py-2 font-medium">Last change</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {refunds.map((r) => {
          const last = r.notes?.at(-1);
          return (
            <tr key={r.refundId}>
              <td className="px-4 py-2.5 font-mono text-xs">{r.refundId}</td>
              <td className="px-4 py-2.5">{r.customerName}</td>
              <td className="px-4 py-2.5 font-mono text-xs">{r.orderId}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{usd(r.amount)}</td>
              <td className="px-4 py-2.5">
                <Badge tone={STATUS_TONE[r.status]}>{statusLabel(r.status)}</Badge>
              </td>
              <td className="px-4 py-2.5 text-xs text-gray-500">
                {last ? `${last.by.replace(/^arn:.*\//, "")} · ${ago(last.at)}` : r.requiresApproval ? "—" : "Policy"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function RunTable({ runs }: { runs: AgentRunRecord[] }) {
  if (!runs.length) return <div className="p-5 text-sm text-gray-500">No conversations yet.</div>;
  return (
    <table className="w-full text-sm">
      <thead className="border-b border-gray-200 text-left text-xs text-gray-500">
        <tr>
          <th className="px-4 py-2 font-medium">When</th>
          <th className="px-4 py-2 font-medium">Customer</th>
          <th className="px-4 py-2 font-medium">Message</th>
          <th className="px-4 py-2 font-medium">Model · provider</th>
          <th className="px-4 py-2 font-medium">Tools</th>
          <th className="px-4 py-2 text-right font-medium">Time</th>
          <th className="px-4 py-2 text-right font-medium">Cost</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {runs.map((r) => (
          <tr key={r.runId}>
            <td className="whitespace-nowrap px-4 py-2.5 text-xs text-gray-500">{ago(r.startedAt)}</td>
            <td className="whitespace-nowrap px-4 py-2.5">{personaById(r.customerId)?.name ?? r.customerId}</td>
            <td className="max-w-[280px] truncate px-4 py-2.5 text-gray-600" title={r.firstUserMessage}>
              {r.firstUserMessage}
            </td>
            <td className="whitespace-nowrap px-4 py-2.5 text-xs">
              <span className="font-mono">{r.modelsUsed.join(", ")}</span>
              <span className="text-gray-500"> · {(r.providersUsed ?? []).join(", ")}</span>
              {r.fellBack && (
                <span className="ml-1.5">
                  <Badge tone="amber">failover</Badge>
                </span>
              )}
            </td>
            <td className="px-4 py-2.5 font-mono text-xs text-gray-500">
              {r.toolCalls.map((t) => t.name).join(", ") || "—"}
            </td>
            <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-gray-600">
              {(r.durationMs / 1000).toFixed(1)}s
            </td>
            <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium tabular-nums">{microUsd(r.costUsd)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
