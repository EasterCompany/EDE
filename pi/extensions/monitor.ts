/**
 * Darwin Agent Monitor — captures all agent activity to a persistent JSONL file
 * consumed by the darwin-monitor Rust TUI (<leader>ps).
 *
 * Persists to ~/.pi/agent/activity.jsonl so history survives IDE restarts.
 * Max 10,000 entries, oldest 20% rotated out when full.
 */
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { appendFileSync, writeFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

const MONITOR_FILE = join(homedir(), ".pi", "agent", "activity.jsonl");

interface MonitorEntry {
  ts: number;
  type: "tool_call" | "tool_result" | "tool_output" | "message" | "turn" | "input" | "agent" | "model" | "error";
  data: Record<string, unknown>;
}

let entryCount = 0;
const MAX_ENTRIES = 10000;

function countExisting(): number {
  try {
    if (!existsSync(MONITOR_FILE)) return 0;
    return readFileSync(MONITOR_FILE, "utf-8").split("\n").filter(l => l.trim()).length;
  } catch { return 0; }
}

function rotate(): void {
  try {
    if (!existsSync(MONITOR_FILE)) return;
    const lines = readFileSync(MONITOR_FILE, "utf-8").split("\n").filter(l => l.trim());
    if (lines.length < MAX_ENTRIES) return;
    const keep = lines.slice(Math.floor(lines.length * 0.2));
    writeFileSync(MONITOR_FILE, keep.join("\n") + "\n");
    entryCount = keep.length;
  } catch {}
}

function emit(entry: MonitorEntry): void {
  if (entryCount >= MAX_ENTRIES) rotate();
  entryCount++;
  try {
    const line = JSON.stringify(entry) + "\n";
    if (entryCount <= 1 || !existsSync(MONITOR_FILE)) {
      writeFileSync(MONITOR_FILE, line);
    } else {
      appendFileSync(MONITOR_FILE, line);
    }
  } catch {}
}

export default function (pi: ExtensionAPI) {
  try { mkdirSync(dirname(MONITOR_FILE), { recursive: true }); } catch {}
  entryCount = countExisting();

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
    emit({ ts: Date.now(), type: "input", data: { text: event.text, source: event.source } });
  });

  // ── Tool calls ───────────────────────────────────────────────
  pi.on("tool_call", async (event: any) => {
    const toolName: string = event.toolName || "unknown";
    const args = event.input || {};
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
    } else {
      summary = `${toolName}`;
    }
    emit({ ts: Date.now(), type: "tool_call", data: { toolName, args, summary, toolCallId: event.toolCallId } });
  });

  pi.on("tool_result", async (event: any) => {
    const toolName: string = event.toolName || "unknown";
    const isError: boolean = event.isError || false;
    let preview = "";
    const content = event.content || [];
    if (content.length > 0 && content[0]?.text) {
      preview = String(content[0].text).substring(0, 80);
    }
    emit({ ts: Date.now(), type: "tool_result", data: { toolName, isError, preview, toolCallId: event.toolCallId } });
  });

  // Capture FULL tool output from execution_end (before display)
  pi.on("tool_execution_end", async (event: any) => {
    const toolName: string = event.toolName || "unknown";
    const result = event.result;
    let fullOutput = "";
    if (result?.content && Array.isArray(result.content)) {
      for (const block of result.content) {
        if (block?.type === "text" && block.text) fullOutput += block.text;
      }
    } else if (typeof result?.content === "string") {
      fullOutput = result.content;
    } else if (result?.text) {
      fullOutput = result.text;
    }
    emit({ ts: Date.now(), type: "tool_output", data: { toolName, toolCallId: event.toolCallId, fullOutput, isError: event.isError || false } });
  });

  // ── Messages ─────────────────────────────────────────────────
  pi.on("message_start", async (event: any) => {
    const msg = event.message;
    emit({ ts: Date.now(), type: "message", data: { event: "start", role: msg?.role || "unknown", messageId: msg?.id } });
  });

  pi.on("message_update", async (event: any) => {
    const msg = event.message;
    const evt = event.assistantMessageEvent;
    let text = "";
    if (evt?.type === "content_block_delta" && evt?.delta?.text) text = evt.delta.text;
    emit({ ts: Date.now(), type: "message", data: { event: "update", role: msg?.role || "unknown", text, messageId: msg?.id } });
  });

  pi.on("message_end", async (event: any) => {
    const msg = event.message;
    let fullText = "";
    if (msg?.content) {
      if (typeof msg.content === "string") {
        fullText = msg.content;
      } else if (Array.isArray(msg.content)) {
        fullText = msg.content.filter((b: any) => b?.type === "text").map((b: any) => b.text || "").join("");
      }
    }
    emit({ ts: Date.now(), type: "message", data: { event: "end", role: msg?.role || "unknown", fullText, messageId: msg?.id } });
  });

  // ── Model changes ────────────────────────────────────────────
  pi.on("model_select", async (event: any) => {
    emit({ ts: Date.now(), type: "model", data: { model: event.model?.id || event.model?.name || "unknown", previous: event.previousModel?.id || "none", source: event.source } });
  });

  pi.on("session_shutdown", async () => {
    emit({ ts: Date.now(), type: "agent", data: { event: "shutdown" } });
  });
}
