import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { readFileSync } from "fs";

export default function (pi: ExtensionAPI) {
  // Read API key from OpenCode's auth file
  let apiKey: string | undefined;
  try {
    const auth = JSON.parse(readFileSync(
      `${process.env.HOME || "/root"}/.local/share/opencode/auth.json`,
      "utf-8"
    ));
    apiKey = auth.opencode?.key || auth["opencode-go"]?.key;
  } catch {}

  if (!apiKey) return;

  pi.registerProvider("opencode", {
    name: "OpenCode Zen",
    baseUrl: "https://opencode.ai/zen/v1",
    apiKey,
    authHeader: true,
    api: "openai-completions",
    models: [
      {
        id: "deepseek-v4-flash-free",
        name: "DeepSeek V4 Flash Free",
        reasoning: true,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 16384,
      },
      {
        id: "minimax-m2.5-free",
        name: "MiniMax M2.5 Free",
        reasoning: true,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 16384,
      },
    ],
  });

  pi.registerProvider("opencode-go", {
    name: "OpenCode Go",
    baseUrl: "https://opencode.ai/zen/go/v1",
    apiKey,
    authHeader: true,
    api: "openai-completions",
    models: [
      {
        id: "deepseek-v4-flash",
        name: "DeepSeek V4 Flash",
        reasoning: true,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 16384,
      },
    ],
  });
}
