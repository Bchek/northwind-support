"use client";

import { useChat } from "@ai-sdk/react";
import { WorkflowChatTransport } from "@ai-sdk/workflow/client";
import type { UIMessage } from "ai";
import { useEffect, useRef, useState } from "react";
import { PERSONAS, personaById } from "@/lib/customers";
import { DEFAULT_MODEL, MODELS } from "@/lib/models";
import type { AgentRunRecord } from "@/lib/order-api";
import { Badge, Card, Label, microUsd, usd } from "./ui";
import { RichText } from "./rich-text";

type Trace = AgentRunRecord;

const TOOL_LABELS: Record<string, string> = {
  listOrders: "Looked up orders",
  getOrderDetails: "Read order details",
  trackShipment: "Checked carrier tracking",
  checkReturnEligibility: "Checked return policy",
  requestRefund: "Submitted refund",
};

export function SupportChat({ initialCustomerId }: { initialCustomerId?: string }) {
  const [customerId, setCustomerId] = useState(initialCustomerId);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [simulateOutage, setSimulateOutage] = useState(false);
  const [traces, setTraces] = useState<Trace[]>([]);
  const [input, setInput] = useState("");

  // The transport is created once for the component's lifetime. Model/outage settings
  // travel with each message (sendMessage's `body`), so changing them never recreates
  // the transport or disturbs an in-flight stream. The current run ID lives in the
  // transport's own closure: it's set when a turn starts and read when it ends.
  const [transport] = useState(() => {
    let lastRunId: string | null = null;
    return new WorkflowChatTransport<UIMessage>({
      api: "/api/chat",
      maxConsecutiveErrors: 5,
      prepareSendMessagesRequest: ({ messages, body }) => ({ body: { ...body, messages } }),
      onChatSendMessage: (res) => {
        lastRunId = res.headers.get("x-workflow-run-id");
      },
      onChatEnd: async () => {
        const runId = lastRunId;
        if (!runId) return;
        // The trace is the workflow's return value; it's ready moments after the stream ends.
        for (let i = 0; i < 5; i++) {
          const res = await fetch(`/api/chat/${runId}/trace`);
          if (res.status === 200) {
            const t = (await res.json()) as Trace;
            setTraces((prev) => [...prev, t]);
            return;
          }
          await new Promise((r) => setTimeout(r, 800));
        }
      },
    });
  });

  const { messages, sendMessage, status, setMessages, error } = useChat({ transport });
  const busy = status === "submitted" || status === "streaming";

  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  const persona = personaById(customerId);

  async function choosePersona(id: string) {
    await fetch("/api/session", { method: "POST", body: JSON.stringify({ customerId: id }) });
    setCustomerId(id);
    setMessages([]);
    setTraces([]);
  }

  function send(text: string) {
    if (!text.trim() || busy) return;
    sendMessage({ text }, { body: { model, simulateOutage } });
    setInput("");
  }

  if (!persona) return <PersonaPicker onPick={choosePersona} />;

  const totalCost = traces.reduce((s, t) => s + Math.max(0, t.costUsd), 0);
  const latest = traces.at(-1);

  return (
    <div className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 gap-5 px-5 py-6 lg:grid-cols-[260px_1fr_300px]">
      {/* ---------- Left: who + how ---------- */}
      <aside className="space-y-5">
        <div>
          <Label>Signed in as</Label>
          <div className="mt-2 space-y-1.5">
            {PERSONAS.map((p) => (
              <button
                key={p.id}
                onClick={() => p.id !== customerId && choosePersona(p.id)}
                className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                  p.id === customerId ? "border-foreground bg-gray-50" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="text-sm font-medium">{p.name}</div>
                <div className="text-xs text-gray-500">{p.blurb}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label>Model (via AI Gateway)</Label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
          >
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} · {m.vendor}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-gray-500">{MODELS.find((m) => m.id === model)?.note}</p>
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3">
          <input
            type="checkbox"
            checked={simulateOutage}
            onChange={(e) => setSimulateOutage(e.target.checked)}
            className="mt-0.5 accent-red"
          />
          <span>
            <span className="block text-sm font-medium">Simulate outage</span>
            <span className="block text-xs text-gray-500">
              The selected model fails. AI Gateway fails over to the next vendor; app code doesn&apos;t change.
            </span>
          </span>
        </label>
      </aside>

      {/* ---------- Center: conversation ---------- */}
      <Card className="flex min-h-[70vh] flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <div>
            <div className="text-sm font-medium">Northwind Support</div>
            <div className="text-xs text-gray-500">Usually replies in seconds · Orders, tracking, returns</div>
          </div>
          {messages.length > 0 && (
            <button
              onClick={() => {
                setMessages([]);
                setTraces([]);
              }}
              className="text-xs text-gray-500 hover:text-foreground"
            >
              New conversation
            </button>
          )}
        </div>

        <div ref={scroller} className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {messages.length === 0 && (
            <div className="mx-auto max-w-md pt-10 text-center">
              <div className="text-lg font-medium">Hi {persona.name.split(" ")[0]}, how can we help?</div>
              <p className="mt-1 text-sm text-gray-500">Try one of these, or ask anything about your orders.</p>
              <div className="mt-5 space-y-2">
                {persona.prompts.map((p) => (
                  <button
                    key={p}
                    onClick={() => send(p)}
                    className="block w-full rounded-lg border border-gray-200 px-4 py-2.5 text-left text-sm hover:border-gray-300 hover:bg-gray-50"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <Message key={m.id} message={m} />
          ))}

          {status === "submitted" && (
            <div className="flex gap-1 px-1 text-gray-400">
              <span className="dot">●</span>
              <span className="dot">●</span>
              <span className="dot">●</span>
            </div>
          )}
          {error && (
            <div className="rounded-lg bg-red-soft px-4 py-3 text-sm text-red">
              Sorry, something went wrong on our side. Please try again, or email help@northwind.example and a person
              will pick it up.
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex gap-2 border-t border-gray-200 p-3"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about an order, delivery, or return…"
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
          />
          <button
            disabled={busy || !input.trim()}
            className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Send
          </button>
        </form>
      </Card>

      {/* ---------- Right: what just happened ---------- */}
      <aside className="space-y-4">
        <div>
          <Label>Last turn</Label>
          {latest ? (
            <TraceCard trace={latest} />
          ) : (
            <p className="mt-2 text-sm text-gray-500">
              Send a message to see which model answered, the provider it ran on, the tools it called, and the cost.
            </p>
          )}
        </div>
        {traces.length > 0 && (
          <Card className="p-4">
            <Label>This conversation</Label>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-semibold tabular-nums">{microUsd(totalCost)}</span>
              <span className="text-xs text-gray-500">
                {traces.length} turn{traces.length > 1 ? "s" : ""}
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              vs. ~{usd(4.6)} for a human-handled ticket (see proposal for assumptions).
            </p>
          </Card>
        )}
      </aside>
    </div>
  );
}

function PersonaPicker({ onPick }: { onPick: (id: string) => void }) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Who are you shopping as?</h1>
      <p className="mt-2 text-gray-600">
        Each demo customer has real orders in Northwind&apos;s AWS order system, chosen to show a different support path.
      </p>
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {PERSONAS.map((p) => (
          <button
            key={p.id}
            onClick={() => onPick(p.id)}
            className="rounded-xl border border-gray-200 p-4 text-left transition-colors hover:border-foreground"
          >
            <div className="font-medium">{p.name}</div>
            <div className="mt-1 text-xs text-gray-500">{p.email}</div>
            <div className="mt-3 text-sm text-gray-600">{p.blurb}</div>
          </button>
        ))}
      </div>
    </main>
  );
}

function Message({ message }: { message: UIMessage }) {
  if (message.role === "user") {
    const text = message.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-foreground px-4 py-2.5 text-sm text-white">{text}</div>
      </div>
    );
  }
  return (
    <div className="max-w-[88%] space-y-2">
      {message.parts.map((part, i) => {
        if (part.type === "text") {
          return part.text ? (
            <div key={i} className="rounded-2xl rounded-bl-md bg-gray-100 px-4 py-2.5 text-sm leading-relaxed">
              <RichText text={part.text} />
            </div>
          ) : null;
        }
        if (part.type.startsWith("tool-")) {
          const p = part as { type: string; state: string; output?: unknown };
          const name = p.type.slice(5);
          if (name === "requestRefund" && p.state === "output-available") {
            return <RefundCard key={i} output={p.output as RefundOutput} />;
          }
          return (
            <div key={i} className="flex items-center gap-2 text-xs text-gray-500">
              <span
                className={`h-1.5 w-1.5 rounded-full ${p.state === "output-available" ? "bg-accent" : p.state === "output-error" ? "bg-red" : "animate-pulse bg-gray-300"}`}
              />
              {TOOL_LABELS[name] ?? name}
              <span className="font-mono text-[10px] text-gray-400">AWS</span>
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

type RefundOutput = { refundId: string; amount: number; status: string; nextStep: string } | { error: string };

function RefundCard({ output }: { output: RefundOutput }) {
  if ("error" in output) {
    return <div className="rounded-lg border border-red/20 bg-red-soft px-4 py-3 text-sm text-red">{output.error}</div>;
  }
  const pending = output.status === "PENDING_APPROVAL";
  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-gray-500">{output.refundId}</span>
        <Badge tone={pending ? "amber" : "green"}>{pending ? "Awaiting approval" : "Approved"}</Badge>
      </div>
      <div className="mt-2 text-xl font-semibold tabular-nums">{usd(output.amount)}</div>
      <div className="mt-1 text-xs text-gray-500">{output.nextStep}</div>
    </div>
  );
}

function TraceCard({ trace }: { trace: Trace }) {
  const toolMs = trace.toolCalls.reduce((s, t) => s + t.ms, 0);
  return (
    <Card className="mt-2 divide-y divide-gray-200 text-sm">
      <div className="space-y-2 p-4">
        <div className="flex items-center justify-between">
          <span className="text-gray-500">Answered by</span>
          {trace.fellBack ? <Badge tone="amber">Failed over</Badge> : <Badge tone="green">Primary</Badge>}
        </div>
        <div className="font-medium">{trace.modelsUsed.join(", ")}</div>
        <div className="text-xs text-gray-500">
          on {trace.providersUsed.join(", ")}
          {trace.fellBack && (
            <>
              {" "}
              · requested <span className="font-mono">{trace.requestedModel}</span>
            </>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 p-4">
        <Stat label="Cost" value={microUsd(trace.costUsd)} />
        <Stat label="Total time" value={`${(trace.durationMs / 1000).toFixed(1)}s`} />
        <Stat label="Tokens in / out" value={`${trace.inputTokens.toLocaleString()} / ${trace.outputTokens}`} />
        <Stat label="Model calls" value={String(trace.steps)} />
      </div>
      <div className="p-4">
        <div className="text-xs text-gray-500">Tools ({(toolMs / 1000).toFixed(1)}s in AWS)</div>
        {trace.toolCalls.length === 0 ? (
          <div className="mt-1 text-xs text-gray-400">No tools needed</div>
        ) : (
          <ul className="mt-2 space-y-1">
            {trace.toolCalls.map((t, i) => (
              <li key={i} className="flex justify-between text-xs">
                <span className="font-mono">{t.name}</span>
                <span className="tabular-nums text-gray-500">{t.ms} ms</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="px-4 py-3 font-mono text-[10px] break-all text-gray-400">{trace.runId}</div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="font-medium tabular-nums">{value}</div>
    </div>
  );
}
