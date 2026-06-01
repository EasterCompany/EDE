import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, extname, dirname } from "node:path";

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
      // Set cwd to the file's directory so tools like cargo or prettier find their config
      execSync(command, { encoding: "utf8", stdio: "pipe", cwd: dirname(file) });
      
      // 2. Run Linter Check (Capture remaining issues)
      const lintCmd = detectLintCommand(file);
      if (lintCmd) {
        try {
          execSync(lintCmd, { encoding: "utf8", stdio: "pipe", cwd: dirname(file) });
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
      const output = e.stdout || e.stderr || e.message || "Unknown error";
      ctx.ui.notify("❌ Auto-format failed.", "error");
      await pi.sendUserMessage(`SYSTEM: Auto-format failed for \`${file}\`. This usually happens if there's a syntax error or the formatter is not configured correctly:\n\`\`\`\n${output.substring(0, 1000)}\n\`\`\``);
    }
  });

  function detectFormatCommand(file: string): string | null {
    const ext = extname(file).toLowerCase();
    
    if ([".ts", ".js", ".tsx", ".jsx", ".json", ".css", ".scss", ".md", ".yaml", ".yml"].includes(ext)) {
      return `npx prettier --write "${file}"`;
    }

    if (ext === ".lua") {
      if (commandExists("stylua")) return `stylua "${file}"`;
    }

    if (ext === ".rs") {
      // 'cargo fmt' is preferred, but we fall back to 'rustfmt' if not in a crate
      if (commandExists("cargo")) {
        return `cargo fmt -- "${file}" || rustfmt --edition 2021 "${file}"`;
      }
      if (commandExists("rustfmt")) return `rustfmt --edition 2021 "${file}"`;
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
