/**
 * Darwin Agent Monitor — captures all agent activity to a JSONL file
 * consumed by the darwin-monitor Rust TUI (<leader>ps).
 */
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { appendFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const MONITOR_FILE = "/tmp/darwin-monitor.jsonl";

interface MonitorEntry {
  ts: number;                 // epoch ms
  type: "tool_call" | "tool_result" | "message" | "turn" | "input" | "agent" | "model" | "error";
  data: Record<string, unknown>;
}

let entryCount = 0;
const MAX_ENTRIES = 5000;

function emit(entry: MonitorEntry): void {
  if (entryCount >= MAX_ENTRIES) return; // safety valve
  entryCount++;
  try {
    const line = JSON.stringify(entry) + "\n";
    if (entryCount === 1) {
      writeFileSync(MONITOR_FILE, line);
    } else {
      appendFileSync(MONITOR_FILE, line);
    }
  } catch {}
}

// Truncate file on session start
function reset(): void {
  entryCount = 0;
  try { writeFileSync(MONITOR_FILE, ""); } catch {}
}

export default function (pi: ExtensionAPI) {
  // Ensure dir exists
  try { mkdirSync(dirname(MONITOR_FILE), { recursive: true }); } catch {}

  reset();

  // ── Agent lifecycle ──────────────────────────────────────────
  pi.on("agent_start", async (_event: any) => {
    emit({ ts: Date.now(), type: "agent", data: { event: "start" } });
  });

  pi.on("agent_end", async (_event: any) => {
    emit({ ts: Date.now(), type: "agent", data: { event: "end" } });
  });

  pi.on("turn_start", async (event: any) => {
    emit({ ts: Date.now(), type: "turn", data: { event: "start", turnIndex: event.turnIndex } });
  });

  pi.on("turn_end", async (event: any) => {
    emit({ ts: Date.now(), type: "turn", data: { event: "end", turnIndex: event.turnIndex } });
  });

  // ── User input ───────────────────────────────────────────────
  pi.on("input", async (event: any) => {
    emit({
      ts: Date.now(),
      type: "input",
      data: { text: event.text, source: event.source },
    });
  });

  // ── Tool calls (everything the agent does) ───────────────────
  pi.on("tool_call", async (event: any) => {
    const toolName: string = event.toolName || "unknown";
    const args = event.input || {};

    // Summarise args for display (keep it compact)
    let summary = "";
    if (toolName === "bash") {
      summary = (args.command as string || "").substring(0, 200);
    } else if (toolName === "read") {
      summary = `📖 ${args.path || "?"}`;
    } else if (toolName === "write") {
      summary = `✏️ ${args.path || "?"}`;
    } else if (toolName === "edit") {
      const edits = (args.edits as any[]) || [];
      summary = `🔧 ${args.path || "?"} (${edits.length} edit${edits.length !== 1 ? "s" : ""})`;
    } else if (toolName === "search" || toolName === "grep") {
      summary = `🔍 ${args.pattern || "?"}`;
    } else if (toolName === "find") {
      summary = `🔎 ${args.pattern || "?"}`;
    } else if (toolName === "ls") {
      summary = `📂 ${args.path || "."}`;
    } else {
      summary = `${toolName}`;
    }

    emit({
      ts: Date.now(),
      type: "tool_call",
      data: { toolName, args, summary, toolCallId: event.toolCallId },
    });
  });

  pi.on("tool_result", async (event: any) => {
    const toolName: string = event.toolName || "unknown";
    const content = event.content || [];
    const isError: boolean = event.isError || false;

    // Extract preview text
    let preview = "";
    if (content.length > 0 && content[0]?.text) {
      preview = String(content[0].text).substring(0, 300);
    }

    emit({
      ts: Date.now(),
      type: "tool_result",
      data: {
        toolName,
        isError,
        preview,
        toolCallId: event.toolCallId,
        details: event.details || null,
      },
    });
  });

  // ── Messages (chat — user prompts, assistant thinking, assistant response) ──
  pi.on("message_start", async (event: any) => {
    const msg = event.message;
    const role = msg?.role || "unknown";

    emit({
      ts: Date.now(),
      type: "message",
      data: {
        event: "start",
        role,
        messageId: msg?.id,
      },
    });
  });

  pi.on("message_update", async (event: any) => {
    const msg = event.message;
    const role = msg?.role || "unknown";
    const evt = event.assistantMessageEvent;

    // Extract text delta from streaming event
    let text = "";
    if (evt?.type === "content_block_delta" && evt?.delta?.text) {
      text = evt.delta.text;
    } else if (evt?.type === "content_block_start") {
      text = "[block start]";
    }

    emit({
      ts: Date.now(),
      type: "message",
      data: {
        event: "update",
        role,
        text,
        messageId: msg?.id,
      },
    });
  });

  pi.on("message_end", async (event: any) => {
    const msg = event.message;
    const role = msg?.role || "unknown";

    // Extract full text content from final message
    let fullText = "";
    if (msg?.content) {
      if (typeof msg.content === "string") {
        fullText = msg.content;
      } else if (Array.isArray(msg.content)) {
        fullText = msg.content
          .filter((b: any) => b?.type === "text")
          .map((b: any) => b.text || "")
          .join("");
      }
    }

    emit({
      ts: Date.now(),
      type: "message",
      data: {
        event: "end",
        role,
        fullText,
        messageId: msg?.id,
      },
    });
  });

  // ── Model changes ────────────────────────────────────────────
  pi.on("model_select", async (event: any) => {
    emit({
      ts: Date.now(),
      type: "model",
      data: {
        model: event.model?.id || event.model?.name || "unknown",
        previous: event.previousModel?.id || "none",
        source: event.source,
      },
    });
  });

  // ── Session shutdown flush ───────────────────────────────────
  pi.on("session_shutdown", async () => {
    emit({
      ts: Date.now(),
      type: "agent",
      data: { event: "shutdown" },
    });
  });
}
