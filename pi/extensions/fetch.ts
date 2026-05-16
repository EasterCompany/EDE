import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "fetch",
    label: "Fetch",
    description:
      "Fetch content from a URL via HTTP GET. Returns the response body as text. " +
      "Use this to read API documentation, check endpoint responses, grab web content, " +
      "or interact with HTTP APIs. Supports JSON, HTML, and plain text responses.",
    promptSnippet: "Fetch web content or API responses from URLs",
    promptGuidelines: [
      "Use fetch to retrieve web content, API responses, or documentation from URLs rather than using bash curl when you only need to read content.",
      "For API endpoints, prefer fetch over curl for cleaner output formatting.",
    ],
    parameters: Type.Object({
      url: Type.String({
        description: "The URL to fetch. Must include protocol (http:// or https://).",
      }),
      format: Type.Optional(
        Type.String({
          description:
            "Expected response format. 'auto' infers from Content-Type. " +
            "'text' returns raw body. 'json' pretty-prints JSON. 'html' attempts markdown conversion. Default: 'auto'.",
        })
      ),
      headers: Type.Optional(
        Type.Record(Type.String(), Type.String(), {
          description:
            "Optional HTTP headers to include, e.g. { 'Authorization': 'Bearer token', 'Accept': 'application/json' }",
        })
      ),
      timeout: Type.Optional(
        Type.Number({
          description: "Timeout in milliseconds (default: 15000).",
        })
      ),
    }),
    required: ["url"],

    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      const { url, format = "auto", headers = {}, timeout = 15000 } = params as {
        url: string;
        format?: string;
        headers?: Record<string, string>;
        timeout?: number;
      };

      // Validate URL
      let parsed: URL;
      try {
        parsed = new URL(url);
        if (!["http:", "https:"].includes(parsed.protocol)) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Invalid protocol "${parsed.protocol}". Only http:// and https:// are supported.`,
              },
            ],
            isError: true,
            details: { error: "Invalid protocol" },
          };
        }
      } catch {
        return {
          content: [{ type: "text", text: `❌ Invalid URL: "${url}". Must include protocol (http:// or https://).` }],
          isError: true,
          details: { error: "Invalid URL" },
        };
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          headers: {
            "User-Agent": "DarwinIDE/1.0 (EasterCompany; +https://easter.company)",
            Accept: "*/*",
            ...headers,
          },
          signal: signal ?? controller.signal,
        });

        clearTimeout(timeoutId);

        const contentType = response.headers.get("content-type") || "";
        const status = response.status;
        const statusText = response.statusText;

        // Determine effective format
        const effectiveFormat =
          format === "auto"
            ? contentType.includes("json")
              ? "json"
              : contentType.includes("html")
                ? "html"
                : "text"
            : format;

        const body = await response.text();
        const truncated = body.length > 50000;
        const displayBody = truncated ? body.slice(0, 50000) + "\n\n... [truncated at 50KB]" : body;

        let output = `## Fetch: \`${url}\`\n\n`;
        output += `**Status:** ${status} ${statusText}\n`;
        output += `**Content-Type:** ${contentType}\n`;
        if (truncated) output += `**Note:** Response truncated to 50KB (actual: ${(body.length / 1024).toFixed(1)}KB)\n`;
        output += "\n";

        if (effectiveFormat === "json") {
          try {
            const parsed_json = JSON.parse(displayBody);
            output += "```json\n" + JSON.stringify(parsed_json, null, 2).slice(0, 40000) + "\n```";
          } catch {
            output += "```\n" + displayBody + "\n```";
          }
        } else {
          output += "```\n" + displayBody + "\n```";
        }

        return {
          content: [{ type: "text", text: output }],
          details: {
            url,
            status,
            contentType,
            size: body.length,
            truncated,
          },
        };
      } catch (err: any) {
        const message = err.name === "AbortError" ? `Request timed out after ${timeout}ms` : err.message;
        return {
          content: [{ type: "text", text: `❌ Fetch failed: ${message}` }],
          isError: true,
          details: { error: message, url },
        };
      }
    },
  });
}
