/**
 * Darwin IDE — Neovim command passthrough from pi agent interface.
 *
 * Typing a colon-prefixed command (`:w`, `:wqa`, `:q!`, `:e file.txt`, etc.)
 * in the pi chat input forwards it directly to the host Neovim instance
 * instead of sending it to the LLM.
 *
 * Works by reading $NVIM (Neovim server socket set by termopen) and
 * using `nvim --remote-send` to inject keystrokes.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { execSync } from "child_process";

export default function (pi: ExtensionAPI) {
  // ── :command passthrough (user types colon commands in pi chat) ──
  pi.on("input", async (event, ctx) => {
    const raw = event.text.trim();

    // Only intercept colon-prefixed commands (not empty, not just ":")
    if (!raw.startsWith(":") || raw === ":") {
      return;
    }

    const server = process.env.NVIM;
    if (!server) {
      ctx.ui.notify("No Neovim server socket ($NVIM) — not running inside Neovim terminal.", "warning");
      return { action: "continue" };
    }

    // Extract the command (everything after ":")
    const nvimCmd = raw.slice(1).trim();
    if (!nvimCmd) {
      return { action: "continue" };
    }

    try {
      // <C-\><C-N> escapes terminal/insert mode into normal mode,
      // then we type the colon command followed by Enter.
      // The colon command naturally enters command-line mode.
      execSync(
        `nvim --server "${server}" --remote-send '<C-\\><C-N>:${escapeForVim(nvimCmd)}<CR>'`,
        { timeout: 3000 },
      );
      ctx.ui.notify(`Neovim: :${nvimCmd}`, "info");
    } catch (err: any) {
      ctx.ui.notify(`Neovim command failed: ${err?.message || err}`, "error");
    }

    // Always mark as handled — don't send colon commands to the LLM
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
          description: "The Neovim colon command (without the leading colon), e.g. 'vsp /path/to/file.ts' or 'w' or 'bd'",
        },
      },
      required: ["command"],
    },
    execute: async (toolCallId: string, params: { command: string }) => {
      const server = process.env.NVIM;
      if (!server) {
        return {
          content: [{ type: "text", text: "Error: No Neovim server socket ($NVIM) — not running inside Neovim terminal." }],
          isError: true,
        };
      }

      try {
        const escaped = params.command.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
        execSync(
          `nvim --server "${server}" --remote-send '<C-\\><C-N>:${escaped}<CR>'`,
          { timeout: 3000 },
        );
        return {
          content: [{ type: "text", text: `Executed Neovim command: :${params.command}` }],
          isError: false,
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Neovim command failed: ${err?.message || err}` }],
          isError: true,
        };
      }
    },
  });
}

/**
 * Escape characters that would break the Vim command string.
 * Surrounds the entire command in quotes and escapes internal quotes.
 */
function escapeForVim(cmd: string): string {
  return cmd.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
