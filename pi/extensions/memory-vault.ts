import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const MEMORY_DIR = join(homedir(), ".pi", "agent", "vault");
const SHARED_STATE = join(homedir(), ".ede", "shared_state.json");

export default function (pi: ExtensionAPI) {
  try { 
    mkdirSync(MEMORY_DIR, { recursive: true }); 
    mkdirSync(join(homedir(), ".ede"), { recursive: true });
  } catch {}

  // ── Register Memory Search Tool ──────────────────────────
  pi.registerTool({
    name: "search_memory",
    description: "Searches the Darwin long-term memory vault for past summaries, decisions, and progress reports.",
    parameters: Type.Object({
      query: Type.String({ description: "Keywords to search for in past memories." }),
    }),
    execute: async (args) => {
      const query = args.query.toLowerCase();
      const results: string[] = [];

      try {
        const files = readdirSync(MEMORY_DIR).filter(f => f.endsWith(".md"));
        for (const file of files) {
          const content = readFileSync(join(MEMORY_DIR, file), "utf8");
          if (content.toLowerCase().includes(query)) {
            results.push(`### Memory: ${file}\n${content}`);
          }
        }
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error searching vault: ${e.message}` }], isError: true };
      }

      if (results.length === 0) {
        return { content: [{ type: "text", text: "No relevant memories found in the vault." }] };
      }

      return {
        content: [{ type: "text", text: `Found ${results.length} relevant memories:\n\n${results.join("\n\n---\n\n")}` }],
      };
    },
  });

  // ── Sync Intent to Shared State ──────────────────────────
  pi.on("turn_end", async (event) => {
    // If turn index is low, maybe it's a new intent
    if (event.turnIndex === 1) {
      // Try to find the user's first message
      // This is a bit complex without full history access in the event, 
      // but we can look at the current active session.
    }
  });

  // ── Archive Progress summaries to Vault ──────────────────
  pi.on("message_end", async (event) => {
    const msg = event.message;
    if (msg.role === "assistant") {
      let text = "";
      if (typeof msg.content === "string") {
        text = msg.content;
      } else if (Array.isArray(msg.content)) {
        text = msg.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
      }

      if (text.includes("# PROGRESS")) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = `progress-${timestamp}.md`;
        try {
          writeFileSync(join(MEMORY_DIR, filename), text);
          
          // Update Shared State with latest intent/progress
          const state = {
            last_activity: Date.now(),
            latest_summary: text.substring(0, 500) + "...",
            project: process.cwd()
          };
          writeFileSync(SHARED_STATE, JSON.stringify(state, null, 2));
        } catch {}
      }
    }
  });

  // ── Inject Shared State into Context ─────────────────────
  pi.on("before_agent_start", async (event) => {
    const extra: string[] = [];
    
    if (existsSync(SHARED_STATE)) {
      try {
        const state = JSON.parse(readFileSync(SHARED_STATE, "utf8"));
        // Only inject if it was recent (last 1 hour)
        if (Date.now() - state.last_activity < 3600000) {
          extra.push(`## Shared IDE Context (Global Intent)\n${state.latest_summary}`);
        }
      } catch {}
    }

    return {
      systemPrompt: event.systemPrompt + (extra.length > 0 ? `\n\n${extra.join("\n\n")}` : "")
    };
  });
}
