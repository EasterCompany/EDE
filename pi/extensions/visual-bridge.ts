import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { execSync } from "node:child_process";
import { join, extname } from "node:path";

export default function (pi: ExtensionAPI) {
  // ── Visual Feedback Bridge ──
  // If a frontend file is changed, we provide a "visual hint" 
  // or trigger pi-annotate updates.

  pi.on("tool_result", async (event) => {
    // Note: We need to detect which file was changed from the tool call
  });

  let lastChangedFile: string | null = null;
  pi.on("tool_call", async (event) => {
    const editTools = ["write_file", "write", "edit", "replace", "patch"];
    if (editTools.includes(event.toolName)) {
      lastChangedFile = event.input?.file_path || event.input?.path || null;
    }
  });

  pi.on("turn_end", async (event, ctx) => {
    if (!lastChangedFile) return;
    
    const file = lastChangedFile;
    lastChangedFile = null;

    const ext = extname(file).toLowerCase();
    const visualExts = [".html", ".css", ".tsx", ".jsx", ".svg", ".png", ".jpg"];
    
    if (visualExts.includes(ext)) {
      ctx.ui.notify(`Visual change detected in ${file}.`, "info");
      
      // Heuristic: If it's a web component/file, provide a 'visual' summary
      // In a real environment, this might call a headless browser or pi-annotate
      
      // For the POC, we inject a prompt to remind the agent to check visual consistency
      await pi.sendUserMessage(`SYSTEM: Visual change detected in \`${file}\`. Please ensure the UI remains consistent and visually aligned with EC standards. (Hint: use \`pi-annotate\` or check terminal snapshots if available).`);
    }
  });
}
