import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { readFileSync } from "node:fs";
import * as http from "node:http";
import * as https from "node:https";

// ── Smart proxy with free→paid failover ────────────────────
// Starts a local HTTP proxy that forwards to the free OpenCode
// endpoint. On HTTP 429 (rate limited), it automatically retries
// on the paid Go endpoint.
//
// This lets us double-quota: try free first, fall through to
// the $10/mo Go subscription when congested.

const FREE_BASE = "https://opencode.ai/zen/v1";
const PAID_BASE = "https://opencode.ai/zen/go/v1";

let proxyPort: number | null = null;

function startFailoverProxy(apiKey: string): Promise<number> {
  if (proxyPort) return Promise.resolve(proxyPort); // already started

  return new Promise<number>((resolve, reject) => {
    const server = http.createServer((req, clientRes) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        const body = Buffer.concat(chunks);
        const path = req.url || "/";
        relay(FREE_BASE, path, req, clientRes, apiKey, body, 0);
      });
    });

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as any).port;
      proxyPort = port;
      server.unref();
      console.error(`[opencode-smart] Proxy on :${port} — free\u2192${FREE_BASE}, fallback\u2192${PAID_BASE}`);
      resolve(port);
    });
  });
}

function relay(
  baseUrl: string,
  path: string,
  _req: http.IncomingMessage,
  clientRes: http.ServerResponse,
  apiKey: string,
  body: Buffer,
  attempt: number,
) {
  const target = new URL(baseUrl + path);
  const isHttps = target.protocol === "https:";
  const mod: typeof https | typeof http = isHttps ? https : http;

  const options: https.RequestOptions = {
    hostname: target.hostname,
    port: target.port || (isHttps ? 443 : 80),
    path: target.pathname + target.search,
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Content-Length": body.length,
      Host: target.host,
    },
  };

  const proxyReq = mod.request(options, (proxyRes) => {
    // On 429 and we haven't retried yet, fail over to the paid endpoint
    if (proxyRes.statusCode === 429 && attempt === 0) {
      proxyRes.destroy();
      console.error("[opencode-smart] 429 on free, falling through to paid");
      relay(PAID_BASE, path, _req, clientRes, apiKey, body, 1);
      return;
    }

    // Forward response headers
    const cleanedHeaders: Record<string, string | string[]> = {};
    if (proxyRes.headers) {
      for (const [k, v] of Object.entries(proxyRes.headers)) {
        if (k && !["transfer-encoding", "connection", "keep-alive"].includes(k)) {
          cleanedHeaders[k] = v;
        }
      }
    }
    clientRes.writeHead(proxyRes.statusCode || 200, cleanedHeaders);
    proxyRes.pipe(clientRes);
  });

  proxyReq.on("error", (err) => {
    if (attempt === 0) {
      // Network error on free — retry on paid
      relay(PAID_BASE, path, _req, clientRes, apiKey, body, 1);
    } else {
      clientRes.writeHead(502);
      clientRes.end(JSON.stringify({ error: err.message }));
    }
  });

  proxyReq.write(body);
  proxyReq.end();
}

// ── Provider registration ──────────────────────────────────

export default async function (pi: ExtensionAPI) {
  // Read API key from OpenCode's auth file
  let apiKey: string | undefined;
  try {
    const auth = JSON.parse(readFileSync(
      `${process.env.HOME || "/root"}/.local/share/opencode/auth.json`,
      "utf-8",
    ));
    apiKey = auth.opencode?.key || auth["opencode-go"]?.key;
  } catch {}

  if (!apiKey) return;

  // ── Standard free-tier provider ───────────────────────────
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
        contextWindow: 1000000,
        maxTokens: 16384,
      },
      {
        id: "minimax-m2.5-free",
        name: "MiniMax M2.5 Free",
        reasoning: true,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1000000,
        maxTokens: 16384,
      },
    ],
  });

  // ── Paid Go subscription provider ─────────────────────────
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
        contextWindow: 1000000,
        maxTokens: 16384,
      },
    ],
  });

  // ── Smart provider with auto-failover ─────────────────────
  // The "deepseek-v4-flash-smart" model tries free first, then
  // falls through to the paid Go subscription on 429.
  try {
    const port = await startFailoverProxy(apiKey);

    pi.registerProvider("opencode-smart", {
      name: "OpenCode Smart",
      baseUrl: `http://127.0.0.1:${port}`,
      apiKey,
      authHeader: true,
      api: "openai-completions",
      models: [
        {
          id: "deepseek-v4-flash-smart",
          name: "DeepSeek V4 Flash (auto failover)",
          reasoning: true,
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 1000000,
          maxTokens: 16384,
          compat: {
            maxTokensField: "max_tokens",
          },
        },
      ],
    });
  } catch (e: any) {
    console.error("[opencode-smart] Failed to start proxy:", e.message);
  }
}
