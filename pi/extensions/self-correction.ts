import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

export default function (pi: ExtensionAPI) {
  // ── Surgical Edit Self-Correction ──
  // If a 'replace' or 'edit' tool fails because it couldn't find the text,
  // we automatically search the file and provide a hint.
  
  pi.on("tool_result", async (event) => {
    if (event.isError && (event.toolName === "replace" || event.toolName === "edit")) {
      const errorText = event.content?.[0]?.text || "";
      
      // Look for "not found" or "mismatch" style errors
      if (errorText.includes("0 occurrences found") || errorText.includes("match not found")) {
        // We attempt to find the original path from the tool call
        // Note: In some pi-agent versions we need to track this from tool_call
      }
    }
  });

  // Track the last surgical tool call
  let lastSurgicalCall: { path: string; old_string?: string; pattern?: string } | null = null;
  
  pi.on("tool_call", async (event) => {
    if (event.toolName === "replace" || event.toolName === "edit") {
      lastSurgicalCall = {
        path: event.input?.file_path || event.input?.path,
        old_string: event.input?.old_string,
        pattern: event.input?.pattern
      };
    }
  });

  pi.on("tool_result", async (event) => {
    if (event.isError && lastSurgicalCall && (event.toolName === "replace" || event.toolName === "edit")) {
      const errorText = event.content?.[0]?.text || "";
      
      if (errorText.includes("0 occurrences found") || errorText.includes("Failed to find")) {
        const target = lastSurgicalCall.old_string || lastSurgicalCall.pattern;
        if (target) {
          // Attempt self-correction: Grep the file for a partial match
          try {
            const filePath = lastSurgicalCall.path;
            const content = readFileSync(filePath, "utf8");
            
            // Heuristic: Try to find a line that is MOST SIMILAR or contains a significant chunk
            // For now, we'll just do a fuzzy search for the first 20 chars of the target
            const fuzzyTarget = target.trim().substring(0, 30);
            const lines = content.split("\n");
            const matches: string[] = [];
            
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].includes(fuzzyTarget)) {
                matches.push(`Line ${i + 1}: ${lines[i].trim()}`);
              }
            }

            if (matches.length > 0) {
              await pi.sendUserMessage(`SYSTEM: Self-correction triggered. Your edit failed because the 'old_string' didn't match exactly. I found these similar lines in \`${filePath}\`:\n\n${matches.join("\n")}\n\nPlease update your edit to match one of these exactly.`);
            } else {
              // If no fuzzy match, maybe the file changed significantly? 
              // Suggest a full read.
              await pi.sendUserMessage(`SYSTEM: Self-correction failed. I couldn't find anything similar to your target in \`${filePath}\`. Please re-read the file to ensure your context is up to date.`);
            }
          } catch (e: any) {
             // console.error("Self-correction error:", e.message);
          }
        }
      }
    }
    // Clear after every result to prevent stale hints
    lastSurgicalCall = null;
  });
}
