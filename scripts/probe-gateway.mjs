// Dev probe: prints what AI Gateway returns in providerMetadata, and tests failover.
import { generateText } from "ai";
const r = await generateText({
  model: process.argv[2] ?? "anthropic/claude-haiku-5.5",
  prompt: "Say ok.",
  providerOptions: { gateway: { models: ["google/gemini-3.8-flash"], order: ["bedrock", "anthropic"] } },
});
console.log("modelId:", r.response.modelId);
console.log(JSON.stringify(r.providerMetadata?.gateway, null, 1).slice(0, 2500));
