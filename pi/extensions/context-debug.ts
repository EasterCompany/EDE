/**
 * context-debug.ts — Darwin Context Inspector (System Prompt only)
 *
 * Dumps the full assembled system prompt to /tmp/darwin-context.md
 * using pi's own ctx.getSystemPrompt() API.
 *
 * The conversation history is NOT included — it's already visible in the chat window.
 * This keeps the file focused and the TUI fast.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { writeFileSync } from "node:fs";

const OUTPUT_PATH = "/tmp/darwin-context.md";

export default function (pi: ExtensionAPI) {
  let lastDump = 0;
  const THROTTLE_MS = 500;

  function dump(systemPrompt: string) {
    const now = Date.now();
    if (now - lastDump < THROTTLE_MS) return;
    lastDump = now;

    try {
      const report = [
        `> **Source:** ctx.getSystemPrompt() — pi's internal ground truth`,
        `> **Assembled from:** pi base + branding + AGENTS.md + memory facts + ETL state`,
        ``,
        systemPrompt,
        ``,
        `---`,
        `*Darwin Context Inspector — use <leader>pc to open the TUI viewer.*`,
        `*This is the exact system prompt Darwin receives on every inference call.*`,
      ].join("\n");

      writeFileSync(OUTPUT_PATH, report, "utf8");
    } catch {
      // Silent — never interfere with normal operation
    }
  }

  // ── /context command ──────────────────────────────────────
  pi.registerCommand("context", {
    description: "Dump the full system prompt to file",
    handler: async (_args, ctx: ExtensionCommandContext) => {
      const systemPrompt = ctx.getSystemPrompt();
      dump(systemPrompt);
      ctx.ui.notify(
        `System prompt dumped: ${systemPrompt.length.toLocaleString()} chars → /tmp/darwin-context.md`,
        "info",
      );
    },
  });

  // ── Auto-dump on lifecycle events ─────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    try { dump(ctx.getSystemPrompt()); } catch { /* */ }
  });

  pi.on("before_agent_start", async (event, ctx) => {
    try { dump(event.systemPrompt || ctx.getSystemPrompt()); } catch { /* */ }
  });

  pi.on("agent_end", async (_event, ctx) => {
    try { dump(ctx.getSystemPrompt()); } catch { /* */ }
  });

  // Seed
  try {
    writeFileSync(OUTPUT_PATH,
      "> **Source:** ctx.getSystemPrompt() — pi's internal ground truth\n> **Assembled from:** pi base + branding + AGENTS.md + memory facts + ETL state\n\n*No context captured yet — send a prompt to populate this view.*\n\n> **<leader>pc** — Open the TUI viewer\n> **/context** — Manual dump from within pi\n",
      "utf8",
    );
  } catch { /* */ }
}
