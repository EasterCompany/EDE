import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerProvider("easter-company", {
    baseUrl: "https://easter.company/api/ems/v1",
    apiKey: process.env.DARWIN_TOKEN || "no-token",
    authHeader: true,
    api: "openai-completions",
    models: [
      {
        id: "darwin-cloud-nano",
        name: "Darwin Cloud Nano",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1000000,
        maxTokens: 16384
      },
      {
        id: "darwin-cloud-auto",
        name: "Darwin Cloud Auto",
        reasoning: true,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1000000,
        maxTokens: 16384
      },
      {
        id: "darwin-cloud-pro",
        name: "Darwin Cloud Pro",
        reasoning: true,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1000000,
        maxTokens: 16384
      },
      {
        id: "darwin-local-nano",
        name: "Darwin Local Nano",
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
