/**
 * Darwin IDE — Gemini Cloud provider (Ctrl+')
 *
 * Routes pi requests through Google's Gemini API using the user's
 * existing Gemini CLI OAuth credentials. Shares Google AI Pro quota.
 *
 * Models:
 *   darwin-gemini-auto  → smart routing (current best available)
 *   darwin-gemini-pro   → gemini-2.5-pro (largest context, best reasoning)
 *   darwin-gemini-flash → gemini-2.5-flash (fast, efficient)
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { readFileSync } from "node:fs";
import * as http from "node:http";
import * as https from "node:https";

// Google's OpenAI-compatible endpoint for Gemini
const GEMINI_BASE = "generativelanguage.googleapis.com";
const GEMINI_PATH = "/v1beta/openai/chat/completions";

function getAccessToken(): string | null {
  try {
    const creds = JSON.parse(
      readFileSync(
        `${process.env.HOME || "/root"}/.gemini/oauth_creds.json`,
        "utf-8",
      ),
    );
    return creds.access_token || null;
  } catch {
    return null;
  }
}

export default async function (pi: ExtensionAPI) {
  const accessToken = getAccessToken();
  if (!accessToken) {
    console.error("[gemini] No OAuth credentials found — run 'gemini' CLI once to authenticate");
    return;
  }

  console.error("[gemini] Starting Gemini proxy with OAuth token");

  const server = http.createServer((req, clientRes) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      let body = Buffer.concat(chunks);

      // Rewrite model name to actual Gemini model
      let actualModel = "gemini-2.5-flash";
      try {
        const parsed = JSON.parse(body.toString());
        const requested = parsed.model || "";
        if (requested.includes("gemini-pro") || requested.includes("darwin-gemini-pro")) {
          actualModel = "gemini-2.5-pro";
        } else if (requested.includes("gemini-flash") || requested.includes("darwin-gemini-flash")) {
          actualModel = "gemini-2.5-flash";
        } else if (requested.includes("gemini-auto") || requested.includes("darwin-gemini-auto")) {
          // Auto: prefer pro, but always available
          actualModel = "gemini-2.5-pro";
        }
        parsed.model = actualModel;
        body = Buffer.from(JSON.stringify(parsed));
      } catch {}

      const options: https.RequestOptions = {
        hostname: GEMINI_BASE,
        port: 443,
        path: GEMINI_PATH,
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "Content-Length": body.length,
          Host: GEMINI_BASE,
        },
      };

      const proxyReq = https.request(options, (proxyRes) => {
        const cleanedHeaders: Record<string, string | string[]> = {};
        if (proxyRes.headers) {
          for (const [k, v] of Object.entries(proxyRes.headers)) {
            if (k && !["transfer-encoding", "connection", "keep-alive"].includes(k)) {
              cleanedHeaders[k] = v;
            }
          }
        }
        if (!clientRes.headersSent) {
          clientRes.writeHead(proxyRes.statusCode || 200, cleanedHeaders);
        }
        proxyRes.pipe(clientRes);
      });

      proxyReq.on("error", (err) => {
        if (!clientRes.headersSent) {
          clientRes.writeHead(502);
          clientRes.end(JSON.stringify({ error: `Gemini proxy error: ${err.message}` }));
        } else {
          console.error(`[gemini] Network error after headers sent — cannot recover`);
          if (!clientRes.writableEnded) {
            clientRes.destroy();
          }
        }
      });

      proxyReq.write(body);
      proxyReq.end();
    });
  });

  const geminiPort = await new Promise<number>((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as any).port;
      server.unref();
      console.error(`[gemini] Proxy on :${port} → ${GEMINI_BASE}`);
      resolve(port);
    });
  });

  pi.registerProvider("gemini", {
    name: "Gemini Cloud",
    baseUrl: `http://127.0.0.1:${geminiPort}`,
    apiKey: accessToken,
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
