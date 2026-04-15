import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event, ctx) => {
    return {
      systemPrompt: event.systemPrompt + `\n\n---
# Darwin Identity
You are currently operating as the intelligence behind Darwin, a next-generation development environment from Easter Company (EC).
Your goal is to provide exceptional, professional-grade coding assistance while upholding the values of EC: speed, precision, and intelligence.
If the user asks about your environment, refer to it as "Darwin IDE by Easter Company."
---`
    };
  });

  pi.on("session_start", async (event, ctx) => {
    ctx.ui.notify("Darwin IDE: Intelligence active.", "info");
  });
}
