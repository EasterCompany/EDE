import type { ExtensionAPI, ToolCall } from "@mariozechner/pi-coding-agent";
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export default function (pi: ExtensionAPI) {
  const syncFile = "/tmp/darwin-monitor.md";
  const sessionBuffer: string[] = [];
  const sessionId = "sess_" + Date.now().toString(36);

  async function pushToEpisodicMemory(summary: string) {
      try {
          await fetch("http://100.100.1.1:8080/api/ems/memory/episodic", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                  session_id: sessionId,
                  summary: summary
              })
          });
          console.log("[Memory] Sent episodic memory to EMS.");
      } catch (e) {
          console.error("[Memory] Failed to post episodic memory:", e);
      }
  }

  pi.on("tool_call", async (event) => {
    if (event.name === "edit") {
        const input = event.arguments as { path: string, edits: { oldText: string, newText: string }[] };
        let content = `# Darwin Agent: Performing Edit\n\n`;
        content += `File: \`${input.path}\`\n\n`;
        
        try {
            const currentFileContent = readFileSync(input.path, "utf-8");
            content += "## Current File State\n\n```" + (input.path.endsWith('.md') ? 'markdown' : input.path.split('.').pop()) + "\n" + currentFileContent + "\n```\n\n";
            
            content += "## Proposed Changes\n\n";
            for (const edit of input.edits) {
                content += "### Edit Block\n\n```diff\n";
                if (edit.oldText) {
                    content += edit.oldText.split('\n').map(l => `- ${l}`).join('\n') + "\n";
                }
                if (edit.newText) {
                    content += edit.newText.split('\n').map(l => `+ ${l}`).join('\n') + "\n";
                }
                content += "```\n\n";
            }
        } catch (e) {
            content += "*(Could not read file for preview)*";
        }
        
        writeFileSync(syncFile, content);
        sessionBuffer.push(`Intended to edit ${input.path}`);
    }
  });

  pi.on("tool_result", async (event) => {
    if (event.isError) {
        writeFileSync(syncFile, "# ❌ Error executing tool\n\n```json\n" + JSON.stringify(event.content, null, 2) + "\n```");
        sessionBuffer.push(`Error in ${event.toolName}: ${JSON.stringify(event.content)}`);
    } else {
        let content = `# ✨ Last Action: \`${event.toolName}\`\n\n`;
        const input = event.input as any;
        
        if (event.toolName === "read") {
            content += `**File:** \`${input.path}\`\n\n\`\`\`${input.path.split('.').pop()}\n${event.content?.[0]?.text}\n\`\`\``;
            sessionBuffer.push(`Read file ${input.path}`);
        } else if (event.toolName === "bash") {
            content += "### Command executed\n\n```bash\n" + input.command + "\n```\n\n### Output\n\n```text\n" + event.content?.[0]?.text + "\n```";
            sessionBuffer.push(`Ran bash command: ${input.command}`);
        } else if (event.toolName === "edit") {
            content += `### Edit Complete on \`${input.path}\`\n\n`;
            sessionBuffer.push(`Successfully edited ${input.path}`);
        } else if (event.toolName === "write") {
            content += `### Created/Updated File: \`${input.path}\`\n\n\`\`\`${input.path.split('.').pop()}\n${input.content}\n\`\`\``;
            sessionBuffer.push(`Wrote file ${input.path}`);
        } else {
            content += "*(Tool executed successfully)*";
            sessionBuffer.push(`Used tool ${event.toolName}`);
        }
        
        writeFileSync(syncFile, content);
    }

    // Every 5 actions, flush to episodic memory
    if (sessionBuffer.length >= 5) {
        const summary = "Recent actions:\n- " + sessionBuffer.join("\n- ");
        await pushToEpisodicMemory(summary);
        sessionBuffer.length = 0; // clear
    }
  });
}
