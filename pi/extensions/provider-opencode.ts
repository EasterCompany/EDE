import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { readFileSync } from "node:fs";
import * as http from "node:http";
import * as https from "node:https";

const FREE_BASE = "https://opencode.ai/zen/v1";
const PAID_BASE = "https://opencode.ai/zen/go/v1";

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

  // ── OpenGo provider: unified model tiers with quota-aware routing ──
  //
  //   darwin-opengo-lite  → DeepSeek V4 Flash (free tier, unlimited quota)
  //   darwin-opengo-auto  → best model with cascading fallbacks on exhaustion
  //   darwin-opengo-pro   → DeepSeek V4 Pro (paid Go subscription)
  //
  // Only the "darwin-opengo/*" models are exposed in the model picker — all
  // other non-opengo providers are omitted intentionally.

  const LITE_MODEL = "deepseek-v4-flash-free";
  const STANDARD_MODEL = "deepseek-v4-flash-free";
  const PRO_MODEL = "deepseek-v4-pro";

  interface Tier {
    baseUrl: string;
    model: string;
  }

  const AUTO_CHAIN: Tier[] = [
    // Try Pro (paid) first, fall back to Flash (free) on quota exhaustion
    { baseUrl: PAID_BASE, model: PRO_MODEL },
    { baseUrl: FREE_BASE, model: STANDARD_MODEL },
  ];

  function resolveTiers(requestedModel: string): Tier[] {
    switch (requestedModel) {
      case "darwin-opengo-lite":
        return [{ baseUrl: FREE_BASE, model: LITE_MODEL }];
      case "darwin-opengo-pro":
        return [{ baseUrl: PAID_BASE, model: PRO_MODEL }];
      case "darwin-opengo-auto":
        return AUTO_CHAIN;
      default:
        // Unknown model — route through free tier as safe default
        return [{ baseUrl: FREE_BASE, model: LITE_MODEL }];
    }
  }

  function tryTier(
    index: number,
    tiers: Tier[],
    _req: http.IncomingMessage,
    clientRes: http.ServerResponse,
    apiKey: string,
    body: Buffer,
  ) {
    if (index >= tiers.length) {
      if (!clientRes.headersSent) {
        clientRes.writeHead(502);
        clientRes.end(JSON.stringify({ error: "All tiers exhausted" }));
      }
      return;
    }

    const tier = tiers[index];
    const target = new URL(tier.baseUrl + (_req.url || "/"));
    const isHttps = target.protocol === "https:";
    const mod: typeof https | typeof http = isHttps ? https : http;

    let rewritten = body;
    try {
      const parsed = JSON.parse(body.toString());
      if (parsed.model) {
        parsed.model = tier.model;
      }
      if (Array.isArray(parsed.messages)) {
        for (const msg of parsed.messages) {
          if (msg.role === "developer") msg.role = "system";
        }
      }
      rewritten = Buffer.from(JSON.stringify(parsed));
    } catch {}

    const options: https.RequestOptions = {
      hostname: target.hostname,
      port: target.port || (isHttps ? 443 : 80),
      path: target.pathname + target.search,
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Content-Length": rewritten.length,
        Host: target.host,
      },
    };

    const proxyReq = mod.request(options, (proxyRes) => {
      if (
        (proxyRes.statusCode === 429 || proxyRes.statusCode === 503) &&
        index < tiers.length - 1
      ) {
        proxyRes.destroy();
        console.error(
          `[opengo] ${proxyRes.statusCode} on tier ${index} (${tier.model}), falling through to tier ${index + 1}`,
        );
        tryTier(index + 1, tiers, _req, clientRes, apiKey, body);
        return;
      }

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
      if (index < tiers.length - 1 && !clientRes.headersSent) {
        console.error(`[opengo] Network error on tier ${index}, falling through`);
        tryTier(index + 1, tiers, _req, clientRes, apiKey, body);
      } else if (!clientRes.headersSent) {
        clientRes.writeHead(502);
        clientRes.end(JSON.stringify({ error: err.message }));
      } else {
        // Headers already sent — response is mid-stream, can't retry.
        // Just destroy the upstream request and let the partial response stand.
        console.error(`[opengo] Network error on tier ${index} after headers sent — cannot recover`);
        if (!clientRes.writableEnded) {
          clientRes.destroy();
        }
      }
    });

    proxyReq.write(rewritten);
    proxyReq.end();
  }

  try {
    const server = http.createServer((req, clientRes) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        const body = Buffer.concat(chunks);
        let model = "darwin-opengo-auto";
        try {
          const parsed = JSON.parse(body.toString());
          model = parsed.model || model;
        } catch {}
        const tiers = resolveTiers(model);
        tryTier(0, tiers, req, clientRes, apiKey, body);
      });
    });

    const opengoPort = await new Promise<number>((resolve, reject) => {
      server.on("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const port = (server.address() as any).port;
        server.unref();
        console.error(
          `[opengo] Proxy on :${port} — lite→${LITE_MODEL}, auto→chain, pro→${PRO_MODEL}`,
        );
        resolve(port);
      });
    });

    pi.registerProvider("opengo", {
      name: "OpenGo Cloud",
      baseUrl: `http://127.0.0.1:${opengoPort}`,
      apiKey,
      authHeader: true,
      api: "openai-completions",
      models: [
        {
          id: "darwin-opengo-lite",
          name: "Darwin OpenGo Lite",
          reasoning: false,
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 1000000,
          maxTokens: 16384,
        },
        {
          id: "darwin-opengo-auto",
          name: "Darwin OpenGo Auto",
          reasoning: true,
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 1000000,
          maxTokens: 16384,
        },
        {
          id: "darwin-opengo-pro",
          name: "Darwin OpenGo Pro",
          reasoning: true,
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 1000000,
          maxTokens: 16384,
        },
      ],
    });
  } catch (e: any) {
    console.error("[opengo] Failed to start proxy:", e.message);
  }
}
