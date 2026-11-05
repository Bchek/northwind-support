import Link from "next/link";
import { Card } from "@/components/ui";
import { DEMO_AGENT_PUBLIC } from "@/lib/demo";

// Fully static: no request data, so this whole page is prerendered at build time.

const ENTRIES = [
  {
    href: "/support",
    title: "Customer chat",
    body: "Sign in as one of three shoppers and ask about orders, tracking, and returns. Switch models or simulate an outage.",
    cta: "Open chat",
  },
  {
    href: "/console",
    title: "Support console",
    body: "Approve refunds the agent escalated, and see what every conversation cost, which model answered, and where time went.",
    cta: "Open console",
  },
  {
    href: "/proposal",
    title: "Proposal",
    body: "The problem, target architecture, what stays on AWS and why, rollout plan, and success measures.",
    cta: "Read proposal",
  },
];

const FLOW = [
  { label: "Next.js on Vercel", sub: "Chat + console UI", tone: "vercel" },
  { label: "Workflow + AI SDK", sub: "Durable agent loop", tone: "vercel" },
  { label: "AI Gateway", sub: "Bedrock → Gemini → Nova", tone: "vercel" },
  { label: "OIDC → IAM role", sub: "No stored keys", tone: "edge" },
  { label: "Order API on AWS", sub: "API Gateway · Lambda · DynamoDB", tone: "aws" },
];

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 pb-24">
      <section className="pt-16 pb-12 sm:pt-24">
        <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          An AI support agent that works with the order system Northwind already runs.
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-gray-600 text-pretty">
          Northwind Outfitters answers about 1,400 support tickets a week, and 6 in 10 are &ldquo;where is my order&rdquo; or
          &ldquo;can I return this.&rdquo; This demo moves those conversations to a durable agent on Vercel, while orders,
          refund policy, and customer data stay on AWS.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/support"
            className="rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-700"
          >
            Try the agent
          </Link>
          <Link
            href="/proposal"
            className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium hover:bg-gray-50"
          >
            Read the proposal
          </Link>
        </div>
      </section>

      {/* The boundary at a glance. */}
      <Card className="overflow-x-auto p-5">
        <div className="flex min-w-[760px] items-stretch gap-2">
          {FLOW.map((f, i) => (
            <div key={f.label} className="flex flex-1 items-center gap-2">
              <div
                className={`flex-1 rounded-lg border px-3 py-3 ${
                  f.tone === "aws"
                    ? "border-amber/30 bg-amber-soft"
                    : f.tone === "edge"
                      ? "border-dashed border-gray-300 bg-white"
                      : "border-gray-200 bg-gray-50"
                }`}
              >
                <div className="text-sm font-medium">{f.label}</div>
                <div className="mt-0.5 text-xs text-gray-500">{f.sub}</div>
              </div>
              {i < FLOW.length - 1 && <span className="text-gray-300">→</span>}
            </div>
          ))}
        </div>
        <div className="mt-3 flex min-w-[760px] text-[11px] font-medium uppercase tracking-wider text-gray-500">
          <div className="flex-[3]">Vercel</div>
          <div className="flex-1 text-center">Boundary</div>
          <div className="flex-1 text-right">Stays on AWS</div>
        </div>
      </Card>

      <section className="mt-10 grid gap-4 md:grid-cols-3">
        {ENTRIES.map((e) => (
          <Link key={e.href} href={e.href} className="group">
            <Card className="h-full p-5 transition-colors group-hover:border-gray-300">
              <h2 className="font-medium">{e.title}</h2>
              <p className="mt-2 text-sm text-gray-600">{e.body}</p>
              <div className="mt-4 text-sm font-medium text-accent">{e.cta} →</div>
            </Card>
          </Link>
        ))}
      </section>

      <section className="mt-10">
        <Card className="p-5">
          <h2 className="font-medium">Try it in two minutes</h2>
          <ol className="mt-3 space-y-2 text-sm text-gray-600">
            <li>
              <span className="mr-2 font-mono text-gray-400">1</span>
              In <b>Customer chat</b>, choose <b>Jordan Rivera</b> and ask to return the down parka. Confirm when the agent
              asks.
            </li>
            <li>
              <span className="mr-2 font-mono text-gray-400">2</span>
              The $248 refund is over the $100 auto-approve limit, so it waits for a person. Open the <b>Support console</b>{" "}
              and sign in as <code className="rounded bg-gray-100 px-1">{DEMO_AGENT_PUBLIC.email}</code> /{" "}
              <code className="rounded bg-gray-100 px-1">{DEMO_AGENT_PUBLIC.password}</code>.
            </li>
            <li>
              <span className="mr-2 font-mono text-gray-400">3</span>
              Approve it. The suspended workflow resumes, pays out, and writes the result back to AWS.
            </li>
            <li>
              <span className="mr-2 font-mono text-gray-400">4</span>
              Back in chat, turn on <b>Simulate outage</b> and ask anything. AI Gateway fails over to another vendor and the
              trace shows it.
            </li>
          </ol>
        </Card>
      </section>
    </main>
  );
}
