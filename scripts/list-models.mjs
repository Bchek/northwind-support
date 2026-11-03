// Lists language models available through AI Gateway (uses the OIDC token from .env.local).
import { gateway } from "ai";
const { models } = await gateway.getAvailableModels();
for (const m of models.filter((m) => (m.modelType ?? "language") === "language"))
  console.log(m.id, JSON.stringify(m.pricing ?? {}));
