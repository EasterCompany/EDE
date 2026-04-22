import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerProvider("easter-company", {
    baseUrl: "https://easter.company/ems/v1", // Adjust if actual endpoint is different
    apiKey: "DARWIN_TOKEN", // Will be resolved from env or fallback mechanism if needed
    api: "openai-completions",
    models: [
      {
        id: "darwin-cloud",
        name: "Darwin Cloud",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 8192
      },
      {
        id: "darwin-cloud-lite",
        name: "Darwin Cloud Lite",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 8192
      },
      {
        id: "darwin-cloud-auto",
        name: "Darwin Cloud Auto",
        reasoning: true,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 8192
      },
      {
        id: "darwin-cloud-pro",
        name: "Darwin Cloud Pro",
        reasoning: true,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 8192
      },
      {
        id: "darwin-local",
        name: "Darwin Local",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 8192
      },
      {
        id: "darwin-local-lite",
        name: "Darwin Local Lite",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 8192
      },
      {
        id: "darwin-local-auto",
        name: "Darwin Local Auto",
        reasoning: true,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 8192
      },
      {
        id: "darwin-local-pro",
        name: "Darwin Local Pro",
        reasoning: true,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 8192
      }
    ]
  });
}
