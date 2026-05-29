import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, extname } from "node:path";

export default function (pi: ExtensionAPI) {
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

    const command = detectFormatCommand(file);
    if (!command) return;

    ctx.ui.notify(`Auto-formatting ${file}...`, "info");

    try {
      // 1. Run Formatter (Fixes what it can)
      execSync(command, { encoding: "utf8", stdio: "pipe" });
      
      // 2. Run Linter Check (Capture remaining issues)
      const lintCmd = detectLintCommand(file);
      if (lintCmd) {
        try {
          execSync(lintCmd, { encoding: "utf8", stdio: "pipe" });
          ctx.ui.notify("✅ Formatted & Linted.", "success");
        } catch (lintError: any) {
          const output = lintError.stdout || lintError.stderr || lintError.message;
          ctx.ui.notify("⚠️ Lint issues detected.", "warning");
          await pi.sendUserMessage(`SYSTEM: Auto-formatting applied, but lint issues remain in \`${file}\`. Please fix these:\n\`\`\`\n${output.substring(0, 1000)}\n\`\`\``);
        }
      } else {
        ctx.ui.notify("✅ Auto-formatted.", "success");
      }
    } catch (e: any) {
      // Formatter itself failed
      ctx.ui.notify("❌ Auto-format failed.", "error");
    }
  });

  function detectFormatCommand(file: string): string | null {
    const ext = extname(file).toLowerCase();
    
    // Check for local prettier
    const hasPrettier = existsSync(join(process.cwd(), "node_modules", ".bin", "prettier"));
    
    if (ext === ".ts" || ext === ".js" || ext === ".tsx" || ext === ".jsx" || ext === ".json") {
      if (hasPrettier) return `npx prettier --write "${file}"`;
    }

    if (ext === ".lua") {
      if (commandExists("stylua")) return `stylua "${file}"`;
    }

    if (ext === ".rs") {
      // cargo fmt usually works on the whole crate, but we can try rustfmt
      if (commandExists("rustfmt")) return `rustfmt "${file}"`;
    }

    if (ext === ".py") {
      if (commandExists("ruff")) return `ruff format "${file}"`;
      if (commandExists("black")) return `black "${file}"`;
    }

    if (ext === ".go") {
      return `go fmt "${file}"`;
    }

    return null;
  }

  function detectLintCommand(file: string): string | null {
    const ext = extname(file).toLowerCase();

    if (ext === ".ts" || ext === ".js" || ext === ".tsx" || ext === ".jsx") {
      if (existsSync(join(process.cwd(), "node_modules", ".bin", "eslint"))) {
        return `npx eslint "${file}" --quiet`;
      }
    }

    if (ext === ".py") {
      if (commandExists("ruff")) return `ruff check "${file}"`;
    }

    if (ext === ".rs") {
      // For rust, we might just rely on the main auto-validation's 'cargo test'
      // but 'cargo clippy' is better for linting.
      return null; 
    }

    return null;
  }

  function commandExists(cmd: string): boolean {
    try {
      execSync(`command -v ${cmd}`, { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }
}
