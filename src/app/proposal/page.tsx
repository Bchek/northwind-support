import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { Badge, Card, microUsd } from "@/components/ui";
import { orderApi } from "@/lib/order-api";

export const metadata: Metadata = {
  title: "Proposal",
  description: "Durable AI support on Vercel, alongside the AWS order platform Northwind already runs.",
};

// Rendering model for this page (the pattern we'd recommend for Northwind's content pages):
//   - Everything except <MeasuredStats> is static and prerendered at build time.
//   - <MeasuredStats> is cached ("use cache") and tagged "agent-runs". When a chat turn
//     finishes, the trace route calls revalidateTag("agent-runs"), so the numbers refresh
//     on the next visit without rebuilding or re-rendering anything else.

const SECTIONS = [
  ["problem", "1. The problem"],
  ["architecture", "2. Architecture"],
  ["choices", "3. Vercel choices"],
  ["demo", "4. Working demo"],
  ["rollout", "5. Rollout plan"],
  ["success", "6. Success measures"],
  ["risks", "7. Limitations & risks"],
  ["tooling", "8. How this was built"],
] as const;

export default function ProposalPage() {
  return (
    <main className="mx-auto grid w-full max-w-6xl flex-1 gap-10 px-5 pb-24 lg:grid-cols-[200px_1fr]">
      <nav className="sticky top-20 hidden self-start pt-14 text-sm lg:block">
        <div className="mb-3 text-[11px] font-medium uppercase tracking-wider text-gray-500">Contents</div>
        <ul className="space-y-2">
          {SECTIONS.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="text-gray-600 hover:text-foreground">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <article className="max-w-3xl pt-14">
        <Badge tone="green">Proposal · November 2026</Badge>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-balance">
          Durable AI support on Vercel, alongside the AWS order platform Northwind already runs
        </h1>
        <p className="mt-4 text-lg text-gray-600">
          Prepared for Northwind Outfitters&apos; Head of Customer Experience and Platform Engineering lead.
        </p>

        <Card className="mt-8 bg-gray-50 p-6">
          <div className="text-sm font-medium">In short</div>
          <ul className="mt-3 space-y-2 text-[15px] text-gray-700">
            <li>
              • Move &ldquo;where is my order&rdquo; and returns conversations, about <b>60% of ticket volume</b>, to an
              AI agent that runs on Vercel.
            </li>
            <li>
              • <b>Orders, refund policy, payments, and customer data stay on AWS.</b> Vercel calls the existing order
              API with short-lived, narrowly scoped credentials, and no AWS keys are stored anywhere.
            </li>
            <li>
              • Pilot in 5 weeks behind a canary. Target: <b>half of those tickets resolved without a person</b>, at
              about a cent of model cost per conversation instead of about $4.60 of agent time.
            </li>
          </ul>
        </Card>

        {/* ------------------------------------------------------------------ */}
        <Section id="problem" title="1. The problem">
          <p>
            Northwind sells outdoor apparel direct to consumers. Support handles about <b>1,400 tickets a week</b> with
            8 agents, and volume roughly triples from November through January. Six in ten tickets ask one of two
            questions: where is my order, and can I return this. Each one means an agent opening the order system,
            reading carrier tracking or the return policy, and typing an answer.
          </p>
          <p>
            <b>Current stack.</b> The storefront runs on AWS (CloudFront, ECS). Orders and returns live behind an
            internal Order &amp; Returns API (API Gateway, Lambda, DynamoDB) that owns the business rules. Tickets go to
            Zendesk. Last spring the platform team began an AI assistant on Lambda and Bedrock. Four months in, it
            isn&apos;t in production.
          </p>
          <Table
            head={["Where it hurts", "What it costs the business"]}
            rows={[
              [
                "Repetitive lookups are answered by hand.",
                "First response averages ~9 hours at peak. Seasonal contractors cost ~$90k per Q4, and CSAT drops in exactly the weeks that matter.",
              ],
              [
                "The Bedrock prototype stalled on plumbing: retries, conversation state, and the multi-hour wait for refund approval were hand-built on Step Functions and DynamoDB.",
                "Engineering time went into undifferentiated infrastructure instead of the support experience. There's no date for production.",
              ],
              [
                "The prototype is tied to one model provider with no failover. A Black Friday load test hit provider throttling.",
                "The team can't commit to AI for its highest-traffic week.",
              ],
              [
                "Nobody can say what an AI conversation costs.",
                "Finance won't approve scaling it without a unit cost to compare against ~$4.60 per human-handled ticket.",
              ],
              [
                "Refunds over $100 are approved over email and Slack.",
                "Customers wait ~2 days, and there's no audit trail of who approved what.",
              ],
              [
                "The support widget ships with the storefront's weekly Jenkins release.",
                "A one-line prompt or tool fix takes a week to reach customers.",
              ],
            ]}
          />
          <p className="text-sm text-gray-500">
            Figures are a realistic scenario built for this exercise. In a real engagement they would come from Zendesk
            exports and the Q4 staffing plan during discovery.
          </p>
        </Section>

        {/* ------------------------------------------------------------------ */}
        <Section id="architecture" title="2. Architecture">
          <h3 className="font-medium">Current state</h3>
          <Diagram
            lanes={[
              {
                label: "AWS",
                tone: "aws",
                boxes: [
                  ["Storefront", "CloudFront · ECS · Jenkins weekly release"],
                  ["Prototype bot", "Lambda · Step Functions · Bedrock (single provider)"],
                  ["Order & Returns API", "API Gateway · Lambda · DynamoDB"],
                ],
              },
              { label: "SaaS", tone: "plain", boxes: [["Zendesk", "8 agents answer by hand"]] },
            ]}
          />

          <h3 className="mt-8 font-medium">Target state</h3>
          <Diagram
            lanes={[
              {
                label: "Vercel",
                tone: "vercel",
                boxes: [
                  ["Next.js chat + console", "Static shell, streamed data, Fluid Compute"],
                  ["Workflow + AI SDK", "Durable chat turns, refund approval runs"],
                  ["AI Gateway", "Bedrock first, then Gemini, then Nova"],
                ],
              },
              {
                label: "Boundary",
                tone: "edge",
                boxes: [["OIDC → IAM role", "Short-lived creds, execute-api:Invoke only"]],
              },
              {
                label: "AWS (unchanged)",
                tone: "aws",
                boxes: [
                  ["Order & Returns API", "Business rules, refunds, audit trail"],
                  ["DynamoDB", "Orders, refunds, agent run costs"],
                  ["Bedrock", "Still the primary model provider"],
                ],
              },
            ]}
          />
          <p>
            <b>The boundary is the Order &amp; Returns API.</b> Vercel owns the conversation; AWS owns the order. The
            agent asks the API whether a return is eligible and for how much. It never decides that itself, and its
            credentials can&apos;t reach the database directly.
          </p>

          <h3 className="mt-8 font-medium">What stays on AWS, and why</h3>
          <Table
            head={["System", "Why it stays"]}
            rows={[
              [
                "Order & Returns API + DynamoDB",
                "It's the system of record and already encodes the business rules. Moving it adds migration risk with no gain for customers.",
              ],
              [
                "Refund policy (30-day window, final sale, $100 auto-approve limit)",
                "Policy lives with the data it governs. Changing it is one AWS deploy, and the agent picks it up with no prompt change.",
              ],
              ["Refund payout", "Payments stay inside the PCI-scoped environment that's already audited."],
              [
                "IAM",
                "AWS stays the authority on who may call the API. Vercel is granted a role through OIDC federation; revoking it is a trust-policy edit on the AWS side.",
              ],
              [
                "Bedrock",
                "Kept as the first-choice provider behind AI Gateway, so Claude inference keeps drawing down Northwind's existing AWS commitment.",
              ],
              [
                "Agent cost records",
                "Written to Northwind's own DynamoDB, next to the orders they relate to, so Finance can join them in the existing warehouse.",
              ],
            ]}
          />
          <p>
            <b>What moves to Vercel:</b> the conversation UI, the agent loop, the refund-approval workflow, model
            routing, and the release pipeline for the support experience. That&apos;s the layer that was creating
            undifferentiated work.
          </p>
        </Section>

        {/* ------------------------------------------------------------------ */}
        <Section id="choices" title="3. Vercel choices">
          <p>
            Five pieces, each chosen for a specific job. Trade-offs are listed because Northwind should hear them now.
          </p>
          <Choice
            name="Vercel Workflow"
            role="Every chat turn and every refund is a durable run."
            why="Each call into AWS is a step: retried automatically, persisted, and traced. If a function crashes or a deploy lands mid-turn, the run resumes from the last completed step instead of starting over, so a refund can't be created twice. Refunds over $100 pause on a hook until a lead decides, using no compute while they wait, with a 72-hour SLA timer. This replaces the Step Functions and DynamoDB plumbing the prototype stalled on."
            tradeoff="Workflow code has to be deterministic, which is a new discipline for the team. Runs are pinned to the deployment that started them, so long-running refund runs need a versioning policy (see risks)."
          />
          <Choice
            name="AI SDK (WorkflowAgent)"
            role="The agent loop and its five typed tools."
            why="Tools are plain typed functions with schemas, and the customer ID is bound on the server, so the model cannot widen its own data access. The same code runs on any model, which is what makes the next choice possible."
            tradeoff="It's a TypeScript runtime. Northwind's Python data team would consume run records rather than write agent code."
          />
          <Choice
            name="AI Gateway"
            role="One API for every model, with routing, failover, and cost."
            why="Claude is routed to Bedrock first and Anthropic second, with Gemini and then Amazon Nova as cross-vendor fallbacks. Failover is gateway configuration, not application code. Every call returns its provider and exact cost, which is how this demo reports cost per turn. Requests are tagged by customer and feature for spend reports."
            tradeoff="It adds a hop and another vendor in the data path. For production we'd enable zero data retention and disallow prompt training (request-level ZDR needs a Pro or Enterprise plan)."
          />
          <Choice
            name="Next.js 16 on Vercel (Cache Components, Fluid Compute)"
            role="Chat, console, and this page."
            why="Pages prerender as a static shell, and anything that reads the session or live AWS data streams in behind Suspense. The build enforces that split, so personalized data can't leak into a cached page. Fluid Compute bills for active CPU, and an agent turn spends most of its time waiting on the model and on AWS."
            tradeoff="Cache boundaries take some care to design. The build error that enforces them is strict, which is the point."
          />
          <Choice
            name="OIDC federation (with Secure Compute for production)"
            role="How Vercel crosses into AWS."
            why="Each function invocation carries a short-lived Vercel-signed token, which AWS exchanges for credentials on a role that can only invoke this one API. Every request is SigV4-signed, and unsigned requests get a 403. If the order API moves into a private VPC, Secure Compute adds static egress IPs and VPC peering on the same path."
            tradeoff="Secure Compute is an Enterprise feature. Until then the API stays public behind IAM (and a WAF, in production)."
          />
          <Suspense fallback={<StatsSkeleton />}>
            <MeasuredStats />
          </Suspense>
        </Section>

        {/* ------------------------------------------------------------------ */}
        <Section id="demo" title="4. Working demo">
          <p>
            The demo is a slice of the target architecture, deployed on Vercel and calling a real Order &amp; Returns
            API on AWS (us-east-1).
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <LinkCard
              href="/support"
              title="Customer chat"
              body="Three shoppers with real orders. Model picker and outage switch."
            />
            <LinkCard
              href="/console"
              title="Support console"
              body="Sign in as lead@northwind.demo / approve-refunds. Approve escalated refunds; see cost per turn."
            />
            <LinkCard
              href="https://github.com/Bchek/northwind-support"
              title="Source code"
              body="Full commit history. Decisions are commented where they were made."
            />
            <LinkCard
              href="https://github.com/Bchek/northwind-support/blob/main/scripts/eval.mjs"
              title="Agent eval"
              body="8 scripted conversations and 25 checks, run before every promotion."
            />
          </div>
          <p>
            <b>A two-minute path:</b> as Jordan, ask to return the $248 parka and confirm. In the console, approve it
            and watch it move to Issued as the paused workflow resumes and writes back to AWS. Then turn on{" "}
            <i>Simulate outage</i> in chat: the answer still arrives, from another vendor, and the trace says so.
          </p>
        </Section>

        {/* ------------------------------------------------------------------ */}
        <Section id="rollout" title="5. Rollout plan">
          <Table
            head={["Phase", "What happens", "Exit criteria"]}
            rows={[
              [
                "Preview (weeks 1–2)",
                "Every pull request gets a Preview Deployment wired to a staging order API. OIDC tokens carry the environment, so previews can only assume the staging role. The eval suite runs against each preview URL.",
                "25/25 eval checks pass. A security review of the IAM trust policy is complete.",
              ],
              [
                "Validation (week 2)",
                "Shadow mode: the agent drafts replies to real tickets inside Zendesk, and agents rate them without sending.",
                "≥ 90% of drafts rated “send as-is” or “minor edit”. Zero policy violations.",
              ],
              [
                "Canary (weeks 3–4)",
                "A Rolling Release takes the widget to 5%, then 25%, then 50% of storefront sessions. Each stage holds for 48 hours while we watch containment, CSAT, failover rate, cost per turn, and refund errors.",
                "Metrics at or above target at each stage. Automatic abort if refund API errors exceed 1% or CSAT falls below the human baseline.",
              ],
              [
                "Cutover (week 5)",
                "100% of sessions. “Talk to a person” stays one click away, handing off to Zendesk with the transcript attached.",
                "Two weeks of stable pilot metrics, then sign-off for Q4.",
              ],
            ]}
          />
          <h3 className="mt-6 font-medium">Rollback, and what an incident looks like mid-rollout</h3>
          <ul className="space-y-2">
            <li>
              <b>Bad agent behavior</b> (a prompt or tool regression): abort the Rolling Release. Traffic returns to the
              previous deployment, which is still running, so there&apos;s no rebuild. Instant Rollback does the same
              after cutover.
            </li>
            <li>
              <b>Model provider degraded:</b> no action needed. AI Gateway fails over to the next vendor, and the
              console&apos;s failover rate shows it happening.
            </li>
            <li>
              <b>In-flight refunds during a rollback:</b> each refund workflow keeps running on the deployment that
              started it, so a refund waiting for approval finishes on the code it began with. AWS needs no rollback
              because the API contract never changed.
            </li>
            <li>
              <b>Last resort:</b> a feature flag hides the widget and customers see the existing Zendesk form.
            </li>
          </ul>
        </Section>

        {/* ------------------------------------------------------------------ */}
        <Section id="success" title="6. Success measures">
          <Table
            head={["Measure", "Today", "Pilot target", "Measured by"]}
            rows={[
              ["Order and returns tickets resolved without a person", "0%", "50%", "Run records vs. Zendesk handoffs"],
              ["First response time", "~9 h at peak", "< 10 s", "Run start timestamps"],
              ["Decision time for refunds > $100", "~2 days", "< 1 business day", "Refund created → decided in AWS"],
              ["Model cost per resolved conversation", "— (≈$4.60 agent time)", "< $0.05", "AI Gateway cost per run"],
              ["CSAT for AI-handled conversations", "—", "≥ 4.3 / 5 (human baseline)", "Post-chat survey"],
              ["Duplicate or unauthorized refunds", "—", "0", "Idempotency keys, eval suite, audit log"],
              ["Turns answered despite a provider failure", "—", "≥ 99.9%", "Trace failover flag"],
              ["Turns with cost attribution", "0%", "100%", "Run records in DynamoDB"],
            ]}
          />
          <p>
            At 50% containment of the ~840 weekly order and return tickets, that&apos;s about 420 fewer hand-handled
            tickets a week, roughly <b>$100k a year</b> in agent time at $4.60 each. Model cost for the same volume is
            in the tens of dollars.
          </p>
        </Section>

        {/* ------------------------------------------------------------------ */}
        <Section id="risks" title="7. Known limitations and risks">
          <ul className="space-y-3">
            <li>
              <b>Customer identity is simulated.</b> The demo uses a persona picker. Production passes the
              storefront&apos;s existing login token (e.g. Cognito) to Vercel, and the order API should verify it too,
              so customer scoping doesn&apos;t rest on the agent layer alone.
            </li>
            <li>
              <b>The model can still be wrong.</b> Mitigations: facts come only from tools, policy is enforced in AWS,
              refunds require explicit confirmation, and the eval gates every release. We&apos;d still review a weekly
              sample of transcripts during the pilot.
            </li>
            <li>
              <b>Customer data passes through AI Gateway to model providers.</b> Turn on zero data retention and
              disallow prompt training. If a requirement says data must not leave AWS, pin routing to Bedrock only: one
              config line, at the cost of cross-vendor failover.
            </li>
            <li>
              <b>Long-running workflows and deploys.</b> A refund can wait up to 72 hours on the deployment that started
              it. We need a policy for retaining old deployments and for changing hook schemas without stranding runs.
            </li>
            <li>
              <b>Plan features.</b> The demo runs on a Hobby team. Rolling Releases, request-level ZDR, Secure Compute,
              and spend-report APIs used in this plan need Pro or Enterprise.
            </li>
            <li>
              <b>Demo shortcuts.</b> Refund and run listings use DynamoDB scans, and the console login is a shared demo
              account. Production needs indexes and SSO.
            </li>
          </ul>
        </Section>

        {/* ------------------------------------------------------------------ */}
        <Section id="tooling" title="8. How this was built">
          <ul className="space-y-3">
            <li>
              <b>Tools:</b> Claude Code (Claude Opus 5.5) in the terminal as a pair programmer; VS Code; Vercel, AWS,
              and GitHub CLIs. AI SDK 7, Workflow 5, and Next.js 16.4 are newer than most training data, so APIs were
              checked against the docs shipped inside each package, and the gateway&apos;s actual response metadata was
              probed before the trace was designed around it.
            </li>
            <li>
              <b>Validating the AI&apos;s behavior:</b>{" "}
              <code className="rounded bg-gray-100 px-1 text-sm">scripts/eval.mjs</code> runs 8 multi-turn conversations
              with 25 deterministic checks on what the agent did, not on its wording: it confirms before refunding,
              routes by policy, never leaks another customer&apos;s order, refuses injected instructions, survives a
              provider outage, and resumes after human approval. It passes 25/25 locally and against production, for
              under a cent per run.
            </li>
            <li>
              <b>Validating the boundary:</b>{" "}
              <code className="rounded bg-gray-100 px-1 text-sm">scripts/check-boundary.mjs</code> proves that unsigned
              calls are rejected, OIDC-signed calls succeed, and cross-customer reads return 404.
            </li>
            <li>
              <b>What review caught:</b> the first trace flagged every turn as a failover because the gateway reports
              model IDs in a different format. It now uses the gateway&apos;s own routing record. The eval also caught a
              bug in the eval itself: replaying history without tool calls made the model distrust its own earlier
              answers.
            </li>
          </ul>
        </Section>
      </article>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Live numbers from this demo, read from the agent-run records in AWS.
// Cached and tagged; refreshed when a chat turn finishes (see the trace route).
async function MeasuredStats() {
  "use cache";
  cacheTag("agent-runs");
  cacheLife("hours");
  let runs;
  try {
    ({ runs } = await orderApi.listRuns());
  } catch {
    // Don't pin an error state in the cache for hours; retry soon.
    cacheLife("seconds");
    return null;
  }
  const priced = runs.filter((r) => r.costUsd >= 0);
  if (!priced.length) return null;
  const avg = priced.reduce((s, r) => s + r.costUsd, 0) / priced.length;
  const sorted = [...runs].map((r) => r.durationMs).sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length / 2)] / 1000;
  const failovers = runs.filter((r) => r.fellBack).length;
  const providers = [...new Set(runs.flatMap((r) => r.providersUsed ?? []))].filter((p) => p !== "unknown");
  return (
    <Card className="mt-6 p-5">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Measured in this demo</div>
        <span className="text-xs text-gray-500">{runs.length} turns · refreshed as conversations finish</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Avg model cost / turn" value={microUsd(avg)} />
        <Stat label="Median turn time" value={`${p50.toFixed(1)}s`} />
        <Stat label="Turns that failed over" value={`${failovers}`} />
        <Stat label="Providers that served" value={providers.join(", ") || "—"} />
      </div>
    </Card>
  );
}

function StatsSkeleton() {
  return <div className="mt-6 h-[116px] animate-pulse rounded-xl bg-gray-100" />;
}

// ---------------------------------------------------------------------------
function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 pt-14">
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-gray-700">{children}</div>
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-4 py-2.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 align-top">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={`px-4 py-3 ${j === 0 ? "font-medium text-foreground" : "text-gray-600"}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

type Lane = { label: string; tone: "aws" | "vercel" | "edge" | "plain"; boxes: [string, string][] };

function Diagram({ lanes }: { lanes: Lane[] }) {
  const toneCls = {
    aws: "border-amber/30 bg-amber-soft",
    vercel: "border-gray-300 bg-gray-50",
    edge: "border-dashed border-gray-300 bg-white",
    plain: "border-gray-200 bg-white",
  };
  return (
    <Card className="mt-3 overflow-x-auto p-4">
      <div className="flex min-w-[640px] gap-3">
        {lanes.map((lane, i) => (
          <div key={lane.label} className="flex flex-1 items-center gap-3">
            <div className={`flex-1 rounded-lg border p-3 ${toneCls[lane.tone]}`}>
              <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-gray-500">{lane.label}</div>
              <div className="space-y-2">
                {lane.boxes.map(([t, s]) => (
                  <div key={t} className="rounded-md border border-gray-200 bg-white px-3 py-2">
                    <div className="text-sm font-medium text-foreground">{t}</div>
                    <div className="text-xs text-gray-500">{s}</div>
                  </div>
                ))}
              </div>
            </div>
            {i < lanes.length - 1 && <span className="text-gray-300">→</span>}
          </div>
        ))}
      </div>
    </Card>
  );
}

function Choice({ name, role, why, tradeoff }: { name: string; role: string; why: string; tradeoff: string }) {
  return (
    <Card className="p-5">
      <div className="font-medium text-foreground">{name}</div>
      <div className="mt-0.5 text-sm text-gray-500">{role}</div>
      <p className="mt-3 text-sm">{why}</p>
      <p className="mt-2 text-sm text-gray-500">
        <span className="font-medium text-gray-700">Trade-off: </span>
        {tradeoff}
      </p>
    </Card>
  );
}

function LinkCard({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link href={href} className="group">
      <Card className="h-full p-4 transition-colors group-hover:border-gray-300">
        <div className="text-sm font-medium text-foreground">{title} →</div>
        <div className="mt-1 text-sm text-gray-500">{body}</div>
      </Card>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
}
