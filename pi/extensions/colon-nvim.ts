/**
 * Darwin IDE — Neovim command + Pi slash command integration
 *
 * Three features:
 * 1. Colon passthrough — user types `:wqa` in pi chat → forwarded to Neovim via RPC
 * 2. nvim_command tool — Darwin can call it to control the editor
 * 3. slash_command tool — Darwin can execute pi commands (/reload, /compact, etc.)
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { execSync, exec } from "child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function execNvimLua(luaCode: string): { ok: boolean; result?: string; error?: string } {
  const server = process.env.NVIM;
  if (!server) return { ok: false, error: "No Neovim server ($NVIM)" };

  const tmpFile = join(tmpdir(), `nvim-lua-${Date.now()}.lua`);
  try {
    writeFileSync(tmpFile, luaCode);
    const output = execSync(
      `nvim --server '${server}' --remote-expr "execute('luafile ${tmpFile}')" 2>/dev/null`,
      { timeout: 3000, encoding: "utf-8" },
    ).trim();
    return { ok: true, result: output };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  } finally {
    try { unlinkSync(tmpFile); } catch {}
  }
}

function execNvimLuaAsync(luaCode: string): Promise<{ ok: boolean; result?: string; error?: string }> {
  const server = process.env.NVIM;
  if (!server) return Promise.resolve({ ok: false, error: "No Neovim server ($NVIM)" });

  const tmpFile = join(tmpdir(), `nvim-lua-${Date.now()}.lua`);
  return new Promise((resolve) => {
    try {
      writeFileSync(tmpFile, luaCode);
      exec(
        `nvim --server '${server}' --remote-expr "execute('luafile ${tmpFile}')"`,
        { timeout: 5000 },
        (err, stdout) => {
          try { unlinkSync(tmpFile); } catch {}
          if (err) {
            resolve({ ok: false, error: err.message });
          } else {
            resolve({ ok: true, result: (stdout || "").trim() });
          }
        },
      );
    } catch (err: any) {
      try { unlinkSync(tmpFile); } catch {}
      resolve({ ok: false, error: err?.message || String(err) });
    }
  });
}

export default function (pi: ExtensionAPI) {
  // ── :command passthrough (user types colon commands in pi chat) ──
  pi.on("input", async (event, ctx) => {
    const raw = event.text.trim();
    if (!raw.startsWith(":") || raw === ":") return;

    const nvimCmd = raw.slice(1).trim();
    if (!nvimCmd) return { action: "continue" };

    // Quit/close commands would kill pi's own terminal → don't forward
    const dangerous = /^(q|w?qa?|x|exi|clo|quit|exit)(!|\s|$)/i;
    if (dangerous.test(nvimCmd)) {
      ctx.ui.notify("Quit/close commands must be typed in Neovim directly (Ctrl+L then :q)", "warn");
      return { action: "handled" };
    }

    try {
      const luaCode = `vim.cmd("${nvimCmd.replace(/"/g, '\\"')}")`;
      execNvimLuaAsync(luaCode).then((r) => {
        if (r.ok) {
          ctx.ui.notify(`Neovim: :${nvimCmd}`, "info");
        } else {
          ctx.ui.notify(`Neovim: ${r.error || "failed"}`, "error");
        }
      });
    } catch {
      ctx.ui.notify("Failed to execute Neovim command", "error");
      return { action: "continue" };
    }
    return { action: "handled" };
  });

  // ── nvim_command tool ────────────────────────────────────────
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
        command: { type: "string", description: "Neovim colon command without the colon, e.g. 'vsp file.ts' or 'w'" },
      },
      required: ["command"],
    },
    execute: async (_id: string, params: { command: string }) => {
      // Guard against commands that kill the terminal
      const dangerous = /^(q|w?qa?|x|exi|clo|quit|exit)(!|\s|$)/i;
      if (dangerous.test(params.command)) {
        return { content: [{ type: "text", text: "⚠️ Refusing to execute quit/close command — it would kill this session." }], isError: true };
      }

      const luaCode = [
        'for _, win in ipairs(vim.api.nvim_list_wins()) do',
        '  local buf = vim.api.nvim_win_get_buf(win)',
        "  if vim.bo[buf].buftype ~= 'terminal' then",
        '    vim.api.nvim_set_current_win(win)',
        '    break',
        '  end',
        'end',
        `vim.cmd("${params.command.replace(/"/g, '\\"')}")`,
        'return "ok"',
      ].join('\n');

      const r = execNvimLua(luaCode);
      if (r.ok) {
        return { content: [{ type: "text", text: `Executed Neovim command: :${params.command}` }], isError: false };
      }
      return { content: [{ type: "text", text: `Failed: ${r.error}` }], isError: true };
    },
  });

  // ── slash_command tool (Darwin can self-execute pi commands) ──
  pi.registerTool({
    name: "slash_command",
    label: "Pi Slash Command",
    description:
      "Execute a pi slash command in the Darwin IDE chat (e.g. /reload, /compact, /model, /session). " +
      "Use this to reload extensions, switch models, compact context, or run any pi built-in command " +
      "without asking the user to type it manually.",
    promptSnippet: "/{command} — execute a pi slash command",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "Pi slash command without the leading slash, e.g. 'reload' or 'compact'" },
      },
      required: ["command"],
    },
    execute: async (_id: string, params: { command: string }) => {
      const luaCode = [
        'local target_chan = nil',
        'for _, win in ipairs(vim.api.nvim_list_wins()) do',
        '  local buf = vim.api.nvim_win_get_buf(win)',
        "  if vim.bo[buf].buftype == 'terminal' then",
        '    target_chan = vim.bo[buf].channel',
        '    break',
        '  end',
        'end',
        'if target_chan then',
        `  vim.api.nvim_chan_send(target_chan, '/${params.command}\\r')`,
        '  return "ok"',
        'end',
        'return "no terminal"',
      ].join('\n');

      const r = execNvimLua(luaCode);
      if (r.ok) {
        return { content: [{ type: "text", text: `Executed pi command: /${params.command}` }], isError: false };
      }
      return { content: [{ type: "text", text: `Failed: ${r.error || r.result}` }], isError: true };
    },
  });
}
