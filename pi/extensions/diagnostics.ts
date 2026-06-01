import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { execSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";

export default function (pi: ExtensionAPI) {
  let lastChangedFile: string | null = null;
  let isRunningDiagnostics = false;

  pi.on("tool_call", async (event) => {
    const editTools = ["write_file", "write", "edit", "replace", "patch"];
    if (editTools.includes(event.toolName)) {
      lastChangedFile = event.input?.file_path || event.input?.path || null;
    }
  });

  pi.on("turn_end", async (event, ctx) => {
    if (!lastChangedFile || isRunningDiagnostics) return;
    const file = lastChangedFile;
    lastChangedFile = null;

    const diagCmd = detectDiagnosticsCommand(file);
    if (!diagCmd) return;

    isRunningDiagnostics = true;
    ctx.ui.notify(`Running Diagnostics: ${diagCmd}...`, "info");

    try {
      // Use spawn for potentially long-running checks to avoid blocking too much
      // but for now execSync is simpler for structured output parsing.
      const output = execSync(diagCmd, { 
        encoding: "utf8", 
        stdio: ["ignore", "pipe", "pipe"],
        cwd: findProjectRoot(file) || dirname(file)
      });
      
      const diagnostics = parseDiagnostics(output, diagCmd);
      if (diagnostics.length > 0) {
        ctx.ui.notify(`⚠️ ${diagnostics.length} issues found.`, "warning");
        await pi.sendUserMessage(`SYSTEM: Diagnostics for \`${file}\` found issues:\n\n${formatDiagnostics(diagnostics)}`);
      } else {
        ctx.ui.notify("✅ Diagnostics passed.", "success");
      }
    } catch (e: any) {
      const output = (e.stdout || "") + (e.stderr || "");
      const diagnostics = parseDiagnostics(output, diagCmd);
      
      if (diagnostics.length > 0) {
        ctx.ui.notify(`❌ ${diagnostics.length} issues found.`, "error");
        await pi.sendUserMessage(`SYSTEM: Diagnostics FAILED for \`${file}\`. Please fix these issues:\n\n${formatDiagnostics(diagnostics)}`);
      } else {
        ctx.ui.notify("❌ Build/Lint Error", "error");
        await pi.sendUserMessage(`SYSTEM: Diagnostics failed with a fatal error:\n\`\`\`\n${output.substring(0, 1000)}\n\`\`\``);
      }
    } finally {
      isRunningDiagnostics = false;
    }
  });

  function detectDiagnosticsCommand(file: string): string | null {
    const root = findProjectRoot(file);
    if (!root) return null;

    if (existsSync(join(root, "Cargo.toml"))) {
      return "cargo clippy --message-format=json";
    }

    if (existsSync(join(root, "package.json"))) {
      return "npx eslint --format json"; // Simplified
    }

    return null;
  }

  function findProjectRoot(file: string): string | null {
    let curr = dirname(file);
    while (curr !== "/" && curr !== ".") {
      if (existsSync(join(curr, "Cargo.toml")) || existsSync(join(curr, "package.json"))) {
        return curr;
      }
      curr = dirname(curr);
    }
    return null;
  }

  function parseDiagnostics(output: string, cmd: string): any[] {
    const issues: any[] = [];
    
    if (cmd.includes("cargo")) {
      const lines = output.split("\n");
      for (const line of lines) {
        try {
          const msg = JSON.parse(line);
          if (msg.reason === "compiler-message" && msg.message) {
            const diag = msg.message;
            if (diag.level === "error" || diag.level === "warning") {
              issues.push({
                level: diag.level,
                message: diag.message,
                rendered: diag.rendered,
                file: diag.spans?.[0]?.file_name,
                line: diag.spans?.[0]?.line_start
              });
            }
          }
        } catch {}
      }
    }
    
    // Add ESLint parsing here later
    
    return issues;
  }

  function formatDiagnostics(diagnostics: any[]): string {
    // Deduplicate and format
    const seen = new Set();
    return diagnostics
      .filter(d => {
        const key = `${d.level}:${d.message}:${d.line}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(d => `**${d.level.toUpperCase()}** [${d.file}:${d.line}]: ${d.message}\n\`\`\`\n${d.rendered.trim()}\n\`\`\``)
      .join("\n\n");
  }
}
