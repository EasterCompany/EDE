local pi_cmd = vim.fn.stdpath("config") .. "/scripts/darwin-cli.sh"

local function pi_opts()
  return {
    win = { position = "left", width = 0.40, bo = { buflisted = false }, wo = { winbar = '', statusline = '', winfixwidth = true } },
    interactive = true,
  }
end

local function close_pi()
  local term = Snacks.terminal.get(pi_cmd, { create = false })
  if term and term:valid() then
    term:hide()
  end
end

local function close_explorer()
  local explorer = Snacks.picker.get({ source = "explorer" })[1]
  if explorer and not explorer.closed then
    explorer:close()
  end
end

-- New function to handle the desired initialization sequence
local function initialize_neovim_state()
  -- If we are starting with arguments (opening files), don't do this
  if vim.fn.argc() > 0 then
    return
  end

  -- Use VimEnter to ensure the UI is ready
  local group = vim.api.nvim_create_augroup("darwin_initialize_state", { clear = true })
  
  -- Global tracker for monitor context
  _G.darwin_monitor_context = {
    last_file = nil
  }

  vim.api.nvim_create_autocmd("VimEnter", {
    group = group,
    once = true,
    callback = function()
      -- 1. Initialize Pi terminal as the default left sidebar
      local term = Snacks.terminal(pi_cmd, pi_opts())

      -- 2. Manage splash screen and pi monitor
      vim.defer_fn(function()
        local dashboard_win = nil
        for _, win in ipairs(vim.api.nvim_list_wins()) do
          local buf = vim.api.nvim_win_get_buf(win)
          if vim.bo[buf].filetype == "snacks_dashboard" or vim.bo[buf].filetype == "alpha" then
            dashboard_win = win
            break
          end
        end

        if dashboard_win then
          -- The user wants the dashboard to close and the monitor to open
          -- after initialization.
          vim.api.nvim_set_current_win(dashboard_win)
          vim.cmd("stopinsert")
          
          -- Wait for Pi to be ready (simulated by delay for now)
          -- and then switch to the agent monitor.
          vim.defer_fn(function()
            local monitor_ok, monitor = pcall(require, "config.monitor")
            if monitor_ok and monitor.show_monitor_view then
              -- Only switch if we're still on the dashboard
              local current_buf = vim.api.nvim_win_get_buf(dashboard_win)
              if vim.bo[current_buf].filetype == "snacks_dashboard" or vim.bo[current_buf].filetype == "alpha" then
                monitor.show_monitor_view()
              end
            end
          end, 2000) -- Wait 2 seconds for Pi initialization
        end
      end, 50)
    end,
  })
end

-- Initialize state
initialize_neovim_state()

return {
  {
    "folke/snacks.nvim",
    opts = {
      lazygit = {
        enabled = true,
      },
      picker = {
        sources = {
          explorer = {
            layout = {
              preset = "vscode",
              preview = "main",
            },
            jump = { close = true },
          },
        },
      },
    },
  },
}

