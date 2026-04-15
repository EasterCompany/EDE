import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export default function (pi: ExtensionAPI) {
  const syncFile = join(tmpdir(), "darwin-monitor.md");

  pi.on("session_start", async () => {
    writeFileSync(syncFile, "");
  });

  pi.on("tool_result", async (event) => {
    if (event.isError) return;
    
    let content = `# Last Action: ${event.toolName}\n\n`;
    if (event.toolName === "read") {
        content += `File: \`${(event.input as any).path}\`\n\n` + (event as any).content?.[0]?.text;
    } else if (event.toolName === "bash") {
        content += "```bash\n" + (event.input as any).command + "\n```\n\n" + (event as any).content?.[0]?.text;
    } else {
        content += "Tool executed successfully.";
    }
    
    writeFileSync(syncFile, content);
  });
}
