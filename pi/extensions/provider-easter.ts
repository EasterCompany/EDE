import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerProvider("easter-company", {
    baseUrl: "https://easter.company/api/ems/v1",
    apiKey: process.env.DARWIN_TOKEN || "no-token",
    authHeader: true,
    api: "openai-completions",
    models: [
      {
        id: "darwin-easter",
        name: "Darwin Easter",
        reasoning: true,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1000000,
        maxTokens: 16384
      }
    ]
  });
}
