import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export default function (pi: ExtensionAPI) {
  // ── Extract Gemini API Key from existing CLI config ──
  let apiKey = process.env.GEMINI_API_KEY || "";
  
  if (!apiKey) {
    const credsPath = join(homedir(), ".gemini", "gemini-credentials.json");
    if (existsSync(credsPath)) {
      try {
        const creds = JSON.parse(readFileSync(credsPath, "utf8"));
        apiKey = creds.api_key || "";
      } catch {}
    }
  }

  if (!apiKey) return;

  // ── Register Gemini as a high-parity Agent Provider ──
  pi.registerProvider("gemini-agent", {
    name: "Gemini Agent",
    api: "google-ai", // Built-in support in pi-coding-agent
    apiKey: apiKey,
    models: [
      {
        id: "gemini-3.1-pro-preview",
        name: "Gemini 3.1 Pro (Agentic)",
        reasoning: true,
        input: ["text", "image"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 2000000,
        maxTokens: 16384
      },
      {
        id: "gemini-3.1-flash-lite-preview",
        name: "Gemini 3.1 Flash Lite",
        reasoning: false,
        input: ["text", "image"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1000000,
        maxTokens: 8192
      }
    ]
  });
}
