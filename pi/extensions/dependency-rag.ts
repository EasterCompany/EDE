import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname, resolve, extname } from "node:path";

let pendingDependencyContext: string = "";

export default function (pi: ExtensionAPI) {
  // ── Hook into Tool Results to detect file reads ──
  pi.on("tool_result", async (event) => {
    if (event.toolName === "read_file" && !event.isError) {
      const content = event.content?.[0]?.text;
      const path = event.toolCallId; // We need the original path. 
      // Note: pi-coding-agent events vary, but we can capture the path from tool_call
    }
  });

  // Better: Hook into tool_call to get the path, then tool_result to get content
  let lastReadPath: string | null = null;
  pi.on("tool_call", async (event) => {
    if (event.toolName === "read_file" || event.toolName === "read") {
      lastReadPath = event.input?.path || null;
    }
  });

  pi.on("tool_result", async (event) => {
    if ((event.toolName === "read_file" || event.toolName === "read") && !event.isError && lastReadPath) {
      const content = event.content?.[0]?.text;
      if (content && typeof content === "string") {
        processFileDependencies(lastReadPath, content);
      }
    }
  });

  function processFileDependencies(filePath: string, content: string) {
    const dir = dirname(filePath);
    const lines = content.split("\n");
    const importRegex = /(?:import|from)\s+['"]([^'"]+)['"]/g;
    const dependencies: string[] = [];

    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1];
      if (importPath.startsWith(".")) {
        // Resolve relative path
        let targetPath = resolve(dir, importPath);
        // Try common extensions
        const exts = ["", ".ts", ".js", ".tsx", ".jsx", "/index.ts", "/index.js"];
        let found = false;
        for (const ext of exts) {
          if (existsSync(targetPath + ext) && !found) {
            targetPath += ext;
            found = true;
          }
        }

        if (found) {
          try {
            const depContent = readFileSync(targetPath, "utf8");
            const exports = depContent.split("\n")
              .filter(l => l.includes("export "))
              .map(l => l.trim())
              .slice(0, 10); // Limit to first 10 exports
            
            if (exports.length > 0) {
              dependencies.push(`### Dependency: ${importPath} (${targetPath})\nExports:\n${exports.join("\n")}`);
            }
          } catch {}
        }
      }
    }

    if (dependencies.length > 0) {
      pendingDependencyContext = `\n\n--- DEPENDENCY INTELLIGENCE (Tier 0) ---\n${dependencies.join("\n\n")}\n--- END DEPENDENCY INFO ---\n`;
    }
  }

  // ── Inject Dependency Context into next turn ──
  pi.on("before_agent_start", async (event) => {
    const context = pendingDependencyContext;
    pendingDependencyContext = ""; // Clear after use
    
    return {
      systemPrompt: event.systemPrompt + context
    };
  });
}
