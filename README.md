# Northwind Support: a durable AI agent on Vercel, connected to an existing AWS order platform

A Vercel Solutions Architect exercise. **Northwind Outfitters** (a fictional DTC apparel retailer) answers about 1,400 support tickets a week, and 60% of them are "where is my order" or "can I return this." This project moves those conversations to an AI agent running on Vercel. **Orders, refund policy, payments, and customer data stay on AWS.**

- **Live demo:** https://northwind-support-nu.vercel.app
- **Proposal (customer-facing write-up):** https://northwind-support-nu.vercel.app/proposal
- **Support console login:** `lead@northwind.demo` / `approve-refunds` (pre-filled)

## Try it in two minutes

1. **Customer chat** → choose **Jordan Rivera** → "I want to return the down parka" → confirm when asked.
2. The $248 refund is over the $100 auto-approve limit, so a durable workflow **pauses** for a person.
3. **Support console** → sign in → **Approve**. The workflow resumes, pays out, and writes back to AWS (status → Issued).
4. Back in chat, turn on **Simulate outage** and ask anything. AI Gateway fails over to another vendor, and the trace panel shows it.

Each customer has canned prompts for their scenarios, including a prompt-injection attempt and a request for another customer's order.

## Architecture

```
 Vercel                                                     │ boundary │  AWS (us-east-1, unchanged)
                                                            │          │
 Next.js 16 (Cache Components)  ──►  Workflow + AI SDK  ────┼─ OIDC ──┼─►  API Gateway (IAM auth)
 chat · console · proposal           WorkflowAgent, durable │  → STS   │     └─ Lambda: order & returns API
                                     steps, approval hooks  │  → SigV4 │          └─ DynamoDB: orders, refunds,
                                          │                 │          │                       agent run costs
                                          ▼                 │          │
                                     AI Gateway ────────────┼──────────┼─►  Bedrock (first choice for Claude)
                                     fallback: Gemini → Nova│          │
```

**The boundary is the Order & Returns API.** Vercel owns the conversation; AWS owns the order. The agent asks AWS whether a return is eligible and for how much. It never decides that itself, and its IAM role can only call `execute-api:Invoke` on this one API. It has no database access.

| Vercel primitive | What it does here |
|---|---|
| **Workflow** | Each chat turn and each refund is a durable run. AWS calls are `"use step"` (retried, persisted, traced). Refunds over $100 pause on a hook (no compute while waiting) with a 72-hour SLA. |
| **AI SDK** (`WorkflowAgent`) | Agent loop with 5 typed tools. The customer ID is bound on the server from a signed cookie, so the model can't widen its own data access. |
| **AI Gateway** | Bedrock-first provider order, cross-vendor fallback, per-customer spend tags. Cost per call comes from the gateway's response metadata. |
| **Next.js 16 / Fluid Compute** | Static shell + Suspense-streamed session/AWS data (enforced by Cache Components). `/proposal` stats are `"use cache"` + `cacheTag`, invalidated when a turn finishes. |
| **OIDC federation** | No AWS keys stored in Vercel. Each invocation's OIDC token is exchanged for a scoped role. |

## Repo map

| Path | What's there |
|---|---|
| `src/workflows/support-chat.ts` | The chat workflow: agent, tools, gateway routing, run trace |
| `src/workflows/refund.ts` | Refund lifecycle workflow (policy auto-approve / human approval / SLA) |
| `src/workflows/steps.ts` | Durable steps that cross into AWS; error and retry policy |
| `src/lib/order-api.ts` | OIDC → STS → SigV4 client for the AWS API |
| `src/app/api/*` | Chat start/reconnect/trace, approval decisions, sessions |
| `src/app/{support,console,proposal}` | UI |
| `aws/` | CloudFormation template, Lambda (the "existing" system), seed data, deploy script |
| `scripts/eval.mjs` | Agent eval: 8 multi-turn scenarios, 25 checks |
| `scripts/check-boundary.mjs` | Proves unsigned → 403, OIDC-signed → 200, cross-customer → 404 |

## Validation

```bash
node scripts/eval.mjs https://northwind-support-nu.vercel.app   # 25/25, under 1¢ per run
node --env-file=.env.local scripts/check-boundary.mjs
```

The eval checks what the agent *did*, not its wording: it confirms before refunding, routes refunds by policy, never leaks another customer's order, refuses injected instructions, survives a provider outage, and resumes after human approval.

## Running it yourself

```bash
# 1. AWS side (needs AWS CLI credentials). Creates the stack, uploads the Lambda, seeds orders.
./aws/deploy.ps1 -VercelTeamSlug <your-team-slug>

# 2. Vercel side
vercel link
vercel env add NORTHWIND_API_URL        # stack output ApiUrl
vercel env add NORTHWIND_AWS_ROLE_ARN   # stack output VercelRoleArn
vercel env add NORTHWIND_AWS_REGION     # us-east-1
vercel env add SESSION_SECRET           # 32+ random bytes
vercel env pull .env.local              # also writes a short-lived VERCEL_OIDC_TOKEN
npm install && npm run dev
```

Tear down AWS: `aws cloudformation delete-stack --stack-name northwind-order-platform`.

## Known limitations

Customer login is a persona picker. The console uses a shared demo account. Rolling Releases and Secure Compute are in the plan but not the demo (they need Pro/Enterprise). See [the proposal](https://northwind-support-nu.vercel.app/proposal#risks) for the full list.

## Built with

Claude Code (Claude Opus 5.5) as a pair programmer, with library APIs checked against the docs shipped in each package. See [`FEEDBACK.md`](FEEDBACK.md) for notes on the Vercel platform from building this.
