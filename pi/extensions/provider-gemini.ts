/**
 * Darwin IDE — Gemini Cloud provider (Ctrl+')
 *
 * Hijacks the local gemini CLI binary. Every pi API request is forwarded
 * to gemini in headless mode using the user's existing OAuth credentials
 * and Google AI Pro subscription quota — exactly like using gemini CLI.
 *
 * Models:
 *   darwin-gemini-auto  → gemini's default (smartest available)
 *   darwin-gemini-pro   → gemini-2.5-pro (largest context, best reasoning)
 *   darwin-gemini-flash → gemini-2.5-flash (fast, efficient)
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

      // Extract the user's last message and model preference
      let userPrompt = "";
      let requestedModel = "darwin-gemini-auto";
      try {
        const parsed = JSON.parse(body.toString());
        requestedModel = parsed.model || requestedModel;
        const msgs = parsed.messages || [];
        // Find the last user message
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i]?.role === "user" && msgs[i]?.content) {
            if (typeof msgs[i].content === "string") {
              userPrompt = msgs[i].content;
            } else if (Array.isArray(msgs[i].content)) {
              userPrompt = msgs[i].content
                .filter((b: any) => b?.type === "text")
                .map((b: any) => b.text || "")
                .join("\n");
            }
            break;
          }
        }
        // Include system message as context
        const systemMsg = msgs.find((m: any) => m?.role === "system" || m?.role === "developer");
        if (systemMsg?.content && typeof systemMsg.content === "string") {
          userPrompt = systemMsg.content + "\n\n---\n\n" + userPrompt;
        }
      } catch {}

      if (!userPrompt) {
        if (!clientRes.headersSent) {
          clientRes.writeHead(400);
          clientRes.end(JSON.stringify({ error: "No user prompt found in request" }));
        }
        return;
      }

      // Map model name to gemini --model flag
      let geminiModel = "";
      if (requestedModel.includes("gemini-pro")) {
        geminiModel = "gemini-2.5-pro";
      } else if (requestedModel.includes("gemini-flash")) {
        geminiModel = "gemini-2.5-flash";
      }
      // auto → no flag, let gemini CLI choose

      const args = ["-p", userPrompt, "-o", "json"];
      if (geminiModel) args.unshift("--model", geminiModel);

      const child = spawn("gemini", args, {
        env: { ...process.env, HOME: process.env.HOME || "/root" },
        timeout: 120000,
      });

      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
      child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

      child.on("close", (code) => {
        if (code !== 0 || !stdout.trim()) {
          if (!clientRes.headersSent) {
            clientRes.writeHead(502);
            clientRes.end(JSON.stringify({
              error: `gemini CLI exited with code ${code}: ${stderr.slice(0, 200)}`,
            }));
          }
          return;
        }

        try {
          const geminiResp = JSON.parse(stdout);
          const text = geminiResp?.response || geminiResp?.result || geminiResp?.text || stdout;

          // Convert to OpenAI-compatible format
          const openaiResp = {
            id: "gemini-" + Date.now(),
            object: "chat.completion",
            created: Math.floor(Date.now() / 1000),
            model: requestedModel,
            choices: [{
              index: 0,
              message: { role: "assistant", content: typeof text === "string" ? text : JSON.stringify(text) },
              finish_reason: "stop",
            }],
            usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
          };

          if (!clientRes.headersSent) {
            clientRes.writeHead(200, { "Content-Type": "application/json" });
            clientRes.end(JSON.stringify(openaiResp));
          }
        } catch (e: any) {
          if (!clientRes.headersSent) {
            clientRes.writeHead(502);
            clientRes.end(JSON.stringify({ error: `Failed to parse gemini output: ${e.message}`, raw: stdout.slice(0, 500) }));
          }
        }
      });

      child.on("error", (err) => {
        if (!clientRes.headersSent) {
          clientRes.writeHead(502);
          clientRes.end(JSON.stringify({ error: `gemini CLI spawn failed: ${err.message}` }));
        }
      });
    });
  });

  const geminiPort = await new Promise<number>((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as any).port;
      server.unref();
      console.error(`[gemini] Proxy on :${port} → gemini CLI (headless)`);
      resolve(port);
    });
  });

  pi.registerProvider("gemini", {
    name: "Gemini Cloud",
    baseUrl: `http://127.0.0.1:${geminiPort}`,
    apiKey: "gemini-cli",  // dummy — auth is via gemini CLI's OAuth
    authHeader: true,
    api: "openai-completions",
    models: [
      {
        id: "darwin-gemini-auto",
        name: "Darwin Gemini Auto",
        reasoning: true,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1048576,
        maxTokens: 65536,
      },
      {
        id: "darwin-gemini-pro",
        name: "Darwin Gemini Pro",
        reasoning: true,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1048576,
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
