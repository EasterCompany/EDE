/**
 * Darwin IDE — Gemini Cloud provider (Ctrl+')
 *
 * Spawns gemini CLI in headless mode per request, sharing the user's
 * Google AI Pro quota via existing OAuth credentials.
 *
 * Models:
 *   darwin-gemini-auto  → gemini-3.1-pro-preview
 *   darwin-gemini-pro   → gemini-3.1-pro-preview
 *   darwin-gemini-flash → gemini-3-flash-preview
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { spawn } from "child_process";
import * as http from "node:http";

export default async function (pi: ExtensionAPI) {
  const server = http.createServer((req, clientRes) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      let body = Buffer.concat(chunks);
      let model = "gemini-3.1-pro-preview";
      let messages: any[] = [];

      try {
        const parsed = JSON.parse(body.toString());
        messages = parsed.messages || [];
        if (parsed.model?.includes("gemini-flash")) model = "gemini-3-flash-preview";
      } catch {}

      // Build prompt from messages
      const parts: string[] = [];
      for (const m of messages) {
        const content = typeof m.content === "string" ? m.content : "";
        if (m.role === "system" || m.role === "developer") parts.push(content);
        else if (m.role === "user") parts.push(content);
        else if (m.role === "assistant") parts.push("[Assistant]\n" + content);
      }
      const prompt = parts.join("\n\n") || "hi";

      const child = spawn("gemini", ["--model", model, "-p", prompt, "-o", "json", "-y"], {
        env: { ...process.env, HOME: process.env.HOME || "/root" },
        timeout: 120000,
      });

      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d: Buffer) => stdout += d.toString());
      child.stderr.on("data", (d: Buffer) => stderr += d.toString());

      child.on("close", (code) => {
        if (code !== 0 || !stdout.trim()) {
          if (!clientRes.headersSent) {
            clientRes.writeHead(502);
            clientRes.end(JSON.stringify({ error: `gemini CLI exit ${code}: ${stderr.slice(0, 200)}` }));
          }
          return;
        }
        try {
          const r = JSON.parse(stdout);
          const text = r?.response || r?.result || r?.text || stdout;
          const openai = {
            id: "gemini-" + Date.now(),
            object: "chat.completion",
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [{ index: 0, message: { role: "assistant", content: typeof text === "string" ? text : JSON.stringify(text) }, finish_reason: "stop" }],
            usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
          };
          if (!clientRes.headersSent) {
            clientRes.writeHead(200, { "Content-Type": "application/json" });
            clientRes.end(JSON.stringify(openai));
          }
        } catch (e: any) {
          if (!clientRes.headersSent) {
            clientRes.writeHead(502);
            clientRes.end(JSON.stringify({ error: `Parse failed: ${e.message}`, raw: stdout.slice(0, 500) }));
          }
        }
      });

      child.on("error", (err) => {
        if (!clientRes.headersSent) {
          clientRes.writeHead(502);
          clientRes.end(JSON.stringify({ error: err.message }));
        }
      });
    });
  });

  const port = await new Promise<number>((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const p = (server.address() as any).port;
      server.unref();
      console.error(`[gemini] Proxy :${p} → gemini CLI (spawn)`);
      resolve(p);
    });
  });

  pi.registerProvider("gemini", {
    name: "Gemini Cloud",
    baseUrl: `http://127.0.0.1:${port}`,
    apiKey: "gemini-cli",
    authHeader: true,
    api: "openai-completions",
    models: [
      {
        id: "darwin-gemini-auto",
        name: "Darwin Gemini Auto",
        reasoning: true,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 2000000,
        maxTokens: 65536,
      },
      {
        id: "darwin-gemini-pro",
        name: "Darwin Gemini Pro",
        reasoning: true,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 2000000,
        maxTokens: 65536,
      },
      {
        id: "darwin-gemini-flash",
        name: "Darwin Gemini Flash",
        reasoning: true,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1048576,
        maxTokens: 8192,
      },
    ],
  });
}
