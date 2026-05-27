import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { execSync } from "child_process";

export default function (pi: ExtensionAPI) {
  // ── Source user's shell environment before every bash command ──
  pi.on("tool_call", async (event) => {
    if (event.toolName === "bash" && event.input?.command) {
      const cmd = event.input.command as string;
      // Don't double-source if already prefixed
      if (!cmd.startsWith("source ~/.bash_profile")) {
        event.input.command = `source ~/.bash_profile 2>/dev/null; ${cmd}`;
      }
    }
  });

  // ── Darwin identity injection ──
  pi.on("before_agent_start", async (event, ctx) => {
    // Detect the git repo root; fall back to process CWD.
    let workingDir = process.cwd();
    try {
      workingDir = execSync("git rev-parse --show-toplevel", {
        encoding: "utf8",
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {}

    return {
      systemPrompt: event.systemPrompt + `\n\n---
# Darwin Identity
You are currently operating as the intelligence behind Darwin, a next-generation development environment from Easter Company (EC).
Your goal is to provide exceptional, professional-grade coding assistance while upholding the values of EC: speed, precision, and intelligence.
If the user asks about your environment, refer to it as "Darwin IDE by Easter Company."
---
[EMS:wd=${workingDir}]`
    };
  });

  pi.on("session_start", async (_event, ctx) => {
    // Collapse tool outputs in chat — keep it compact, full data is in the monitor
    ctx.ui.setToolsExpanded(false);
    ctx.ui.notify("Darwin IDE: Intelligence active.", "info");
  });

  // ── Compact tool display in chat ─────────────────────────────
  // Show only command + status, full output goes to monitor
  pi.on("tool_result", async (event) => {
    const toolName = event.toolName;
    const isError = event.isError;
    const icon = isError ? "❌" : "✓";
    const code = event.details?.exitCode;
    const status = code !== undefined ? ` (exit ${code})` : "";

    // Bash: just the exit code
    if (toolName === "bash") {
      return {
        content: [{ type: "text", text: `${icon} bash${status}` }],
      };
    }

    // Read/write/edit: just the filename
    if (toolName === "read" || toolName === "write" || toolName === "edit") {
      const path = (event.input as any)?.path || "?";
      return {
        content: [{ type: "text", text: `${icon} ${toolName} \`${path}\`` }],
      };
    }

    // Other tools: just success/fail
    return {
      content: [{ type: "text", text: `${icon} ${toolName}` }],
    };
  });
}
