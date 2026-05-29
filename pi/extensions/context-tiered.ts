import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { homedir } from "node:os";

const PROGRESS_FILE = join(homedir(), ".pi", "agent", "progress.md");
const TURN_THRESHOLD = 15;
let turnCount = 0;

export default function (pi: ExtensionAPI) {
  // ── Tiered Context Injection ──
  pi.on("before_agent_start", async (event) => {
    let workingDir = process.cwd();
    try {
      workingDir = execSync("git rev-parse --show-toplevel", {
        encoding: "utf8",
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {}

    const tiers: string[] = [];

    // Tier 1: Immediate Directory Context
    const localGemini = join(process.cwd(), "GEMINI.md");
    if (existsSync(localGemini)) {
      tiers.push(`## Local Context (${process.cwd()})\n${readFileSync(localGemini, "utf8")}`);
    }

    // Tier 2: Structural/Parent Context (if not root)
    if (process.cwd() !== workingDir) {
      const parentGemini = join(dirname(process.cwd()), "GEMINI.md");
      if (existsSync(parentGemini)) {
        tiers.push(`## Parent Context\n${readFileSync(parentGemini, "utf8")}`);
      }
    }

    // Tier 3: Global System Context
    const globalAgents = join(workingDir, "AGENTS.md");
    if (existsSync(globalAgents)) {
      // We only take the first 100 lines of AGENTS.md to stay context-efficient
      const content = readFileSync(globalAgents, "utf8").split("\n").slice(0, 100).join("\n");
      tiers.push(`## Global System Context\n${content}\n...(truncated for efficiency)`);
    }

    // Tier 4: Git Environment State
    try {
      const branch = execSync("git branch --show-current", { encoding: "utf8" }).trim();
      const status = execSync("git status --short", { encoding: "utf8" }).trim();
      if (branch || status) {
        tiers.push(`## Git State\nBranch: ${branch || "detached"}\nChanges:\n${status || "Clean"}`);
      }
    } catch {}

    // Progress Compaction: Inject last known progress
    if (existsSync(PROGRESS_FILE)) {
      const progress = readFileSync(PROGRESS_FILE, "utf8");
      tiers.push(`## Last Known Progress\n${progress}`);
    }

    const contextPadding = tiers.length > 0 
      ? `\n\n--- ARCHITECTURAL CONTEXT ---\n${tiers.join("\n\n")}\n--- END CONTEXT ---\n` 
      : "";

    return {
      systemPrompt: event.systemPrompt + contextPadding
    };
  });

  // ── Automated Progress Compaction ──
  pi.on("turn_end", async (event, ctx) => {
    turnCount = event.turnIndex || 0;

    if (turnCount > 0 && turnCount % TURN_THRESHOLD === 0) {
      ctx.ui.notify(`Compacting progress (Turn ${turnCount})...`, "info");
      
      // Request a summary from the agent
      // We use a hidden system-like message
      await pi.sendUserMessage(
        "SYSTEM: We have reached a turn checkpoint. Please provide a concise summary of our progress so far, including completed tasks and remaining objectives. Start your response with '# PROGRESS'."
      );
    }
  });

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
        const summary = text.split("# PROGRESS")[1].trim();
        try {
          writeFileSync(PROGRESS_FILE, summary);
          // console.log("[context-tiered] Progress summary captured.");
        } catch {}
      }
    }
  });
}
