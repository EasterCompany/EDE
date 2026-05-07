import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { execSync } from "child_process";

export default function (pi: ExtensionAPI) {
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

  pi.on("session_start", async (event, ctx) => {
    ctx.ui.notify("Darwin IDE: Intelligence active.", "info");
  });
}
