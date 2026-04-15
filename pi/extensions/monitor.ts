import type { ExtensionAPI, ToolCall } from "@mariozechner/pi-coding-agent";
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export default function (pi: ExtensionAPI) {
  const syncFile = "/tmp/darwin-monitor.md";

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
                content += "### Replacement\n\n";
                content += "**Replacing:**\n```\n" + edit.oldText + "\n```\n\n";
                content += "**With:**\n```\n" + edit.newText + "\n```\n\n";
            }
        } catch (e) {
            content += "*(Could not read file for preview)*";
        }
        
        writeFileSync(syncFile, content);
    }
  });

  pi.on("tool_result", async (event) => {
    if (event.isError) {
        writeFileSync(syncFile, "# Error executing tool\n\n" + JSON.stringify(event.content));
        return;
    }
    
    let content = `# Last Action: ${event.toolName}\n\n`;
    const input = event.input as any;
    
    if (event.toolName === "read") {
        content += `File: \`${input.path}\`\n\n\`\`\`${input.path.split('.').pop()}\n${event.content?.[0]?.text}\n\`\`\``;
    } else if (event.toolName === "bash") {
        content += "## Command executed\n\n```bash\n" + input.command + "\n```\n\n## Output\n\n```\n" + event.content?.[0]?.text + "\n```";
    } else if (event.toolName === "edit") {
        content += `## Edit Complete on \`${input.path}\`\n\n`;
        try {
            const updatedContent = readFileSync(input.path, "utf-8");
            content += "### Final File State\n\n```" + input.path.split('.').pop() + "\n" + updatedContent + "\n```";
        } catch (e) {
            content += "Tool executed successfully.";
        }
    } else if (event.toolName === "write") {
        content += `## Created/Updated File: \`${input.path}\`\n\n\`\`\`${input.path.split('.').pop()}\n${input.content}\n\`\`\``;
    } else {
        content += "Tool executed successfully.";
    }
    
    writeFileSync(syncFile, content);
  });
}
