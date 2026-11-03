# Builder feedback: Vercel platform

Notes from building this project, written in the spirit of Iterate to Greatness. Everything here came up during the build.

## What worked really well

- **OIDC federation to AWS** is the best part of the story for an enterprise buyer. The token claims (`iss`, `aud`, `sub` with project and environment) matched the docs exactly, so the IAM trust policy worked the first time, and "no AWS keys stored in Vercel" is a sentence security teams like to hear.
- **AI Gateway's per-call metadata** (`providerMetadata.gateway`) returns the cost, the provider that served the call, and every routing attempt. That made per-turn cost attribution trivial, and failover is configuration (`models`, `order`), not code. Routing Claude to Bedrock first is a strong answer for customers with AWS commitments.
- **Workflow + `WorkflowAgent`**: making a tool durable is one `"use step"` directive. Racing a hook against `sleep("72h")` for an approval SLA is exactly the primitive that customers otherwise build on Step Functions plus a database.
- **Docs shipped inside the npm packages** (`node_modules/*/docs`). These versions (AI SDK 7, Workflow 5, Next 16.4) are newer than what coding assistants know, and the in-package docs were accurate. This is a real advantage for AI-assisted development, and worth promoting.
- **Cache Components' build-time enforcement**, plus the `○ / ◐ / ƒ` legend in build output, makes "what's static and what's dynamic" visible and arguable, which is great for a design review.

## What frustrated me

- **The AI Gateway credit-card requirement surfaced as a runtime error in the middle of a request.** It came back as `GatewayInternalServerError`, which sounds like a Vercel outage, not a billing step. I'd expect `vercel link` / `vercel env pull`, or the AI Gateway dashboard, to flag it before the first call fails.
- **On failover, `response.modelId` still echoes the requested model.** The model that actually answered is only in `providerMetadata.gateway.routing.canonicalSlug`, and `modelId` uses a different format (`claude-haiku-5-5` vs `anthropic/claude-haiku-5.5`). My first trace marked every turn as a failover. The cost and routing fields also aren't in the exported TypeScript types, so I had to declare my own.
- **Connecting GitHub took two separate fixes behind generic errors.** `vercel git connect` first said to add a Login Connection. After that, it said "make sure there aren't any typos", when the real problem was that the Vercel GitHub App wasn't installed. Detecting that and linking straight to the install page would save a support ticket.
- **Two packages for a durable agent:** `@workflow/ai` (`DurableAgent`) and `@ai-sdk/workflow` (`WorkflowAgent`) both install and both ship docs. It took reading both to work out which is current.
- **`import "server-only"` breaks inside workflow step bundles**, because they don't run under the `react-server` condition. That's reasonable, but it isn't documented, and it's a natural thing to put in a module that signs AWS requests.
- **Generated `src/app/.well-known/workflow/**` files trip ESLint** (unused disable directives). They're already git-ignored; an ESLint ignore by default would finish the job.
- **Windows rough edges:** the npm-installed `vercel.ps1` shim is blocked by the default PowerShell execution policy (`vercel.cmd` works), and the CLI writes an XML hint tag to stderr, which PowerShell reports as a `NativeCommandError` on otherwise successful commands.

## What I'd change or add

- An official **"simulate provider failure"** option for AI Gateway (a header or provider option) for chaos-testing failover in Preview Deployments. I used a model ID that doesn't exist, which works but feels like a hack.
- **Typed gateway metadata** (`cost`, `routing.*`) in `GatewayProviderMetadata`, and a `servedModel` field on the step result.
- A short **"Hobby → what you can't demo"** note on plan-gated features (Rolling Releases, request-level ZDR, Secure Compute) for people evaluating Vercel on a personal account.
