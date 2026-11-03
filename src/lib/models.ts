// Model catalog exposed in the demo. Every entry is an AI Gateway model ID, so switching
// models is a string change — no provider SDKs, keys, or code paths per vendor.

export type ModelOption = {
  id: string;
  label: string;
  vendor: string;
  note: string;
};

export const MODELS: ModelOption[] = [
  {
    id: "anthropic/claude-haiku-5.5",
    label: "Claude Haiku 5.5",
    vendor: "Anthropic",
    note: "Default. Fast and cheap; routed to Bedrock first.",
  },
  {
    id: "anthropic/claude-sonnet-5.5",
    label: "Claude Sonnet 5.5",
    vendor: "Anthropic",
    note: "Higher quality for complex disputes; ~20x the cost.",
  },
  {
    id: "google/gemini-3.8-flash",
    label: "Gemini 3.8 Flash",
    vendor: "Google",
    note: "Cross-vendor option; first fallback.",
  },
  {
    id: "amazon/nova-pro",
    label: "Amazon Nova Pro",
    vendor: "Amazon (Bedrock)",
    note: "Stays fully on AWS; last-resort fallback.",
  },
];

export const DEFAULT_MODEL = MODELS[0].id;

// Fallback chain, tried in order by AI Gateway when the primary model errors or is
// unavailable. Cross-vendor on purpose: a single-vendor outage can't take support down.
export const FALLBACK_MODELS = ["google/gemini-3.8-flash", "amazon/nova-pro"];

// Used only by the "simulate outage" toggle: a model ID that the gateway can't serve,
// so the request fails over through FALLBACK_MODELS exactly as it would in a real
// provider outage. Nothing else in the app changes.
export const OUTAGE_MODEL = "anthropic/claude-unavailable-demo";

export const isAllowedModel = (id: string) => MODELS.some((m) => m.id === id);

export function fallbacksFor(primary: string) {
  return FALLBACK_MODELS.filter((m) => m !== primary);
}
