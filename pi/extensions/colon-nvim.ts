/**
 * Darwin IDE — Neovim command integration from pi agent interface.
 *
 * Two features:
 * 1. Colon passthrough — user types `:wqa` in pi chat → forwarded to Neovim via RPC
 * 2. nvim_command tool — Darwin can call it to control the editor
 *
 * Uses nvim_exec_lua via --remote-expr for reliable execution (no keystroke simulation).
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { execSync } from "child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function execNvimCmd(cmd: string): { ok: boolean; error?: string } {
  const server = process.env.NVIM;
  if (!server) {
    return { ok: false, error: "No Neovim server socket ($NVIM)" };
  }

  // Write command to temp file to avoid all shell/Vim quoting issues
  const tmpFile = join(tmpdir(), `nvim-cmd-${Date.now()}.lua`);
  try {
    // Escape for Lua string
    const luaEscaped = cmd
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n");
    const luaCode = `vim.cmd("${luaEscaped}")`;
    writeFileSync(tmpFile, luaCode);

    execSync(
      `nvim --server '${server}' --remote-expr "execute('luafile ${tmpFile}')" 2>/dev/null`,
      { timeout: 3000 },
    );
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  } finally {
    try { unlinkSync(tmpFile); } catch {}
  }
}

export default function (pi: ExtensionAPI) {
  // ── :command passthrough (user types colon commands in pi chat) ──
  pi.on("input", async (event, ctx) => {
    const raw = event.text.trim();

    // Only intercept colon-prefixed commands
    if (!raw.startsWith(":") || raw === ":") {
      return;
    }

    // Extract the command (everything after ":")
    const nvimCmd = raw.slice(1).trim();
    if (!nvimCmd) {
      return { action: "continue" };
    }

    const result = execNvimCmd(nvimCmd);
    if (result.ok) {
      ctx.ui.notify(`Neovim: :${nvimCmd}`, "info");
    } else {
      ctx.ui.notify(`Failed: ${result.error}`, "error");
      return { action: "continue" }; // fall through to LLM on failure
    }

    return { action: "handled" };
  });

  // ── nvim_command tool (Darwin can call this to control Neovim) ──
  pi.registerTool({
    name: "nvim_command",
    label: "Neovim Command",
    description:
      "Execute a Neovim command in the host editor. Use for: opening files in splits (:e, :vsp, :sp), " +
      "saving buffers (:w, :wa), navigating windows (:wincmd w, :bn, :bp), " +
      "closing buffers (:bd, :q), or any valid Neovim colon command. " +
      "Do NOT use for file operations that the agent can do via read/write/edit tools — " +
      "only use this when you need to control the editor UI itself.",
    promptSnippet: ":{command} — control the Neovim editor",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description:
            "The Neovim colon command (without the leading colon), e.g. 'vsp /path/to/file.ts' or 'w' or 'bd'",
        },
      },
      required: ["command"],
    },
    execute: async (_toolCallId: string, params: { command: string }) => {
      const result = execNvimCmd(params.command);
      if (result.ok) {
        return {
          content: [{ type: "text", text: `Executed Neovim command: :${params.command}` }],
          isError: false,
        };
      }
      return {
        content: [{ type: "text", text: `Neovim command failed: ${result.error}` }],
        isError: true,
      };
    },
  });
}
