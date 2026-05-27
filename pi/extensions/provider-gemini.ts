/**
 * Darwin IDE — Gemini Cloud provider (Ctrl+')
 *
 * Spawns gemini CLI in headless mode per request, sharing the user's
 * Google AI Pro quota via existing OAuth credentials.
 *
 * Models (cascade for auto):
 *   darwin-gemini-auto  → pro → flash → flash-lite
 *   darwin-gemini-pro   → gemini-3.1-pro-preview
 *   darwin-gemini-flash → gemini-3-flash-preview
 *   darwin-gemini-lite  → gemini-3.1-flash-lite-preview
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
      let cascade: string[] = [];
      let messages: any[] = [];

      try {
        const parsed = JSON.parse(body.toString());
        messages = parsed.messages || [];
        if (parsed.model?.includes("gemini-pro")) {
          model = "gemini-3.1-pro-preview";
        } else if (parsed.model?.includes("gemini-flash")) {
          model = "gemini-3-flash-preview";
        } else if (parsed.model?.includes("gemini-lite")) {
          model = "gemini-3.1-flash-lite-preview";
        } else {
          // auto: cascade pro → flash → lite
          cascade = ["gemini-3.1-pro-preview", "gemini-3-flash-preview", "gemini-3.1-flash-lite-preview"];
          model = cascade[0];
        }
      } catch {}

      // Build prompt: system context via @file, conversation as text
      let systemText = "";
      const parts: string[] = [];
      for (const m of messages) {
        const content = typeof m.content === "string" ? m.content : "";
        if (m.role === "system" || m.role === "developer") {
          systemText += content + "\n\n";
          continue;
        }
        if (m.role === "user") parts.push(content);
        else if (m.role === "assistant") parts.push(content);
      }

      // Write system context to fixed file — gemini loads via @path syntax,
      // and should deduplicate when the same file is referenced across turns
      const ctxFile = "/tmp/darwin-gemini-system.md";
      try {
        const fs = require("fs");
        fs.writeFileSync(ctxFile, systemText);
      } catch {}

      const prompt = `@${ctxFile}\n\n` + parts.join("\n\n") || "hi";

      // Try spawn with cascade on auto
      trySpawn(0);

      function trySpawn(cascadeIdx: number) {
        const currentModel = cascadeIdx > 0 && cascade.length > 0 ? cascade[cascadeIdx] : model;

        // Use -p with short prefix to signal non-interactive, pipe full text via stdin
        const shortPrompt = prompt.substring(0, 200);
        const remaining = prompt.substring(200);

        const child = spawn("gemini", ["--model", currentModel, "-p", shortPrompt, "-o", "json", "-y"], {
          env: { ...process.env, HOME: process.env.HOME || "/root" },
          stdio: ["pipe", "pipe", "pipe"],
          timeout: 120000,
        });

        // Pipe remaining prompt text (if any) via stdin
        if (remaining) {
          child.stdin!.write(remaining);
        }
        child.stdin!.end();

        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (d: Buffer) => stdout += d.toString());
        child.stderr.on("data", (d: Buffer) => stderr += d.toString());

        child.on("close", (code) => {
          if (code !== 0 || !stdout.trim()) {
            // Cascade: try next model
            if (cascade.length > 0 && cascadeIdx + 1 < cascade.length) {
              trySpawn(cascadeIdx + 1);
              return;
            }
            if (!clientRes.headersSent) {
              clientRes.writeHead(502);
              clientRes.end(JSON.stringify({ error: `gemini ${currentModel} exit ${code}` }));
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
              model: currentModel,
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
              clientRes.end(JSON.stringify({ error: e.message }));
            }
          }
        });

        child.on("error", (err) => {
          if (cascade.length > 0 && cascadeIdx + 1 < cascade.length) {
            trySpawn(cascadeIdx + 1);
            return;
          }
          if (!clientRes.headersSent) {
            clientRes.writeHead(502);
            clientRes.end(JSON.stringify({ error: err.message }));
          }
        });
      }
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
      {
        id: "darwin-gemini-lite",
        name: "Darwin Gemini Lite",
        reasoning: true,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1048576,
        maxTokens: 8192,
      },
    ],
  });
}
