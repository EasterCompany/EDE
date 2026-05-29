import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export default function (pi: ExtensionAPI) {
  let fileChangedInTurn = false;

  // ── Detect File Changes ──
  pi.on("tool_call", async (event) => {
    const editTools = ["write_file", "write", "edit", "replace", "patch"];
    if (editTools.includes(event.toolName)) {
      fileChangedInTurn = true;
    }
  });

  // ── Trigger Validation at End of Turn ──
  pi.on("turn_end", async (event, ctx) => {
    if (!fileChangedInTurn) return;
    fileChangedInTurn = false;

    // Detect Validation Command
    const command = detectValidationCommand();
    if (!command) return;

    ctx.ui.notify(`Auto-validating: ${command}...`, "info");

    try {
      // We run this synchronously for simplicity in the POC, 
      // but in a real extension we might want to pipe output.
      const output = execSync(command, { encoding: "utf8", stdio: "pipe" });
      
      // If we reach here, the command succeeded (exit 0)
      ctx.ui.notify("✅ Auto-validation passed.", "success");
      
      // Optionally inject the result into the next turn so the agent knows it's safe
      await pi.sendUserMessage(`SYSTEM: Auto-validation passed for command: \`${command}\`. Output:\n\`\`\`\n${output.substring(0, 500)}\n\`\`\``);
      
    } catch (e: any) {
      // Command failed (non-zero exit)
      ctx.ui.notify("❌ Auto-validation failed.", "error");
      
      const errorOutput = e.stdout || e.stderr || e.message;
      await pi.sendUserMessage(`SYSTEM: Auto-validation FAILED for command: \`${command}\`. Please fix the issues before proceeding. Output:\n\`\`\`\n${errorOutput.substring(0, 1000)}\n\`\`\``);
    }
  });

  function detectValidationCommand(): string | null {
    const cwd = process.cwd();

    // 1. Check for project-specific override in a local file (e.g. .darwin-validate)
    // or we could look into a special section of GEMINI.md but parsing that is slower.

    // 2. Node.js / TypeScript
    if (existsSync(join(cwd, "package.json"))) {
      try {
        const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
        if (pkg.scripts?.test) return "npm test";
        if (pkg.scripts?.lint) return "npm run lint";
      } catch {}
    }

    // 3. Rust
    if (existsSync(join(cwd, "Cargo.toml"))) {
      return "cargo test --limit-1"; // Limit to keep it fast
    }

    // 4. Python
    if (existsSync(join(cwd, "pytest.ini")) || existsSync(join(cwd, "tests"))) {
      return "pytest";
    }

    return null;
  }
}
